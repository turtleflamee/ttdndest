import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { GameState, GMResponse, PlayerMoveV2 } from "@/lib/types";
import { getGame, updateGame, saveTurn } from "@/lib/storage";
import {
  buildSystemInstructions,
  buildTurnInput,
} from "@/lib/prompt-assembly";
import { applyMemoryPatch } from "@/lib/memory-apply";
import { generateFallbackNarration } from "@/lib/fallback-narration";
import { loadScenario } from "@/lib/scenarios/loader";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ── Helpers ──────────────────────────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      // fall through
    }
  }

  return null;
}

function validateGMResponse(data: unknown): GMResponse | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  if (typeof d.turn !== "number") return null;
  if (typeof d.scene_title !== "string" || !d.scene_title) return null;
  if (typeof d.narration !== "string" || !d.narration) return null;

  return {
    turn: d.turn as number,
    scene_title: d.scene_title as string,
    narration: d.narration as string,
    dialogue: Array.isArray(d.dialogue) ? d.dialogue : [],
    consequences: Array.isArray(d.consequences) ? d.consequences : [],
    next_prompt:
      typeof d.next_prompt === "string" ? d.next_prompt : "What do you do?",
    memory_patch:
      d.memory_patch && typeof d.memory_patch === "object"
        ? (d.memory_patch as GMResponse["memory_patch"])
        : {},
    character_updates: Array.isArray(d.character_updates)
      ? d.character_updates
      : [],
    open_threads: Array.isArray(d.open_threads) ? d.open_threads : [],
    continuity_notes: Array.isArray(d.continuity_notes)
      ? d.continuity_notes
      : undefined,
    previous_response_id:
      typeof d.previous_response_id === "string"
        ? d.previous_response_id
        : undefined,
    location_change:
      typeof d.location_change === "string" ? d.location_change : undefined,
    game_complete:
      typeof d.game_complete === "boolean" ? d.game_complete : undefined,
    game_ending:
      typeof d.game_ending === "string" ? d.game_ending : undefined,
  };
}

function collectPlayerMoves(game: GameState): PlayerMoveV2[] {
  const moves: PlayerMoveV2[] = [];
  for (const player of game.players) {
    if (player.pendingCard) {
      moves.push({
        playerId: player.index,
        cardPlayed: player.pendingCard.cardText,
        cardId: player.pendingCard.cardId,
        target: player.pendingCard.target,
        intent: player.pendingCard.intent,
      });
    }
  }
  return moves;
}

// ── Story summary generation (fire-and-forget) ──────────

async function generateStorySummary(game: GameState): Promise<void> {
  try {
    const recentHistory = (game.history ?? []).slice(-10);
    const historyText = recentHistory
      .map(
        (t) =>
          `Turn ${t.turn} — ${t.scene_title}: ${t.narration.slice(0, 300)}`
      )
      .join("\n\n");

    const result = await getOpenAI().responses.create({
      model: "gpt-5-mini",
      instructions:
        "You are a story summarizer. Given a sequence of tabletop RPG turns, produce a concise 2-3 paragraph summary of the story so far. Focus on major events, character development, and unresolved threads. Return ONLY the summary text, no JSON.",
      input: historyText,
    });

    const summary =
      result.output_text?.trim() ?? "";
    if (summary) {
      game.memoryBundle.story_summary = summary;
    }
  } catch (err) {
    console.error("[gm] Story summary generation failed:", err);
  }
}

// ── Main POST handler ────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { gameId } = (await req.json()) as { gameId: string };
    if (!gameId) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    // 1. Load game state
    const game = await getGame(gameId);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // 2. Load scenario if present
    const scenario = game.scenario_id
      ? loadScenario(game.scenario_id)
      : null;

    // 3. Collect player moves
    // Turn 0 = intro, turn 1 = first round (both auto-generated, no cards needed)
    const playerMoves = collectPlayerMoves(game);
    const isAutoTurn = game.turnCounter <= 1;
    if (!isAutoTurn && playerMoves.length === 0) {
      return NextResponse.json(
        { error: "No player moves pending. Players need to submit cards first." },
        { status: 400 }
      );
    }

    // 4. Build prompts
    const t0 = Date.now();
    console.log(`[gm] Game ${gameId}: prompt_set_code = "${game.prompt_set_code ?? "UNDEFINED — falling back to default!"}"`)
    const systemInstructions = buildSystemInstructions({
      players: game.players,
      scenario: scenario ?? undefined,
      memoryBundle: game.memoryBundle,
      history: game.history,
      turnNumber: game.turnCounter,
      gameMode: game.game_mode,
      promptSetCode: game.prompt_set_code,
    });
    const turnInput = buildTurnInput({
      players: game.players,
      moves: playerMoves,
      turnNumber: game.turnCounter,
      previousNarration: game.history?.length
        ? game.history[game.history.length - 1].narration
        : undefined,
      promptSetCode: game.prompt_set_code,
    });
    const turnNumber = game.turnCounter;

    const tPrompt = Date.now();
    console.log(`[gm] Prompt built in ${tPrompt - t0}ms | system: ${systemInstructions.length} chars | input: ${turnInput.length} chars`);

    // 5. Call OpenAI with 3-tier retry
    let gmResponse: GMResponse | null = null;
    let newResponseId: string | undefined;
    const previousResponseId = game.previous_response_id ?? undefined;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        let result;

        if (attempt === 1) {
          result = await getOpenAI().responses.create({
            model: "gpt-5-mini",
            instructions: systemInstructions,
            input: turnInput,
            max_output_tokens: 4096,
            ...(previousResponseId
              ? { previous_response_id: previousResponseId }
              : {}),
          });
        } else if (attempt === 2) {
          result = await getOpenAI().responses.create({
            model: "gpt-5-mini",
            instructions: systemInstructions,
            input: turnInput,
            max_output_tokens: 4096,
          });
        } else {
          result = await getOpenAI().responses.create({
            model: "gpt-5-mini",
            instructions:
              "You are a tabletop RPG game master. Return a valid JSON object with at minimum: turn (number), scene_title (string), narration (string), consequences (array), next_prompt (string), memory_patch (object), character_updates (array), open_threads (array).",
            input: `Turn ${turnNumber}. Players acted: ${playerMoves.map((m) => `Player ${m.playerId} played "${m.cardPlayed}"`).join("; ")}. Continue the story with a brief narration. Respond ONLY with JSON.`,
          });
        }

        const tApi = Date.now();
        console.log(`[gm] Attempt ${attempt}: OpenAI responded in ${tApi - tPrompt}ms`);
        newResponseId = result.id;
        const raw = result.output_text ?? "";
        console.log(`[gm] Attempt ${attempt}: raw output ${raw.length} chars`);
        console.log(`[gm] Raw output preview: ${raw.substring(0, 300)}`);
        const parsed = extractJson(raw);

        if (parsed) {
          if (typeof parsed.turn !== "number") parsed.turn = turnNumber;
          gmResponse = validateGMResponse(parsed);
          if (gmResponse) break;
        }

        console.warn(
          `[gm] Attempt ${attempt}: failed to parse valid response`
        );
      } catch (err) {
        console.error(`[gm] Attempt ${attempt} error:`, err);
        if (attempt === 1 && previousResponseId) {
          console.warn(
            "[gm] Conversation chaining failed, will retry without it"
          );
        }
      }
    }

    // 6. Fallback if all attempts failed
    if (!gmResponse) {
      console.warn("[gm] All attempts failed, using fallback narration");
      gmResponse = generateFallbackNarration({
        playerNames: game.players.map((p) => p.character ?? p.name),
        sceneTitle: game.scene_title,
        turnNumber,
      });
    }

    // Attach response ID for conversation chaining
    if (newResponseId) {
      gmResponse.previous_response_id = newResponseId;
    }

    // 7. Apply memory patch
    game.memoryBundle = applyMemoryPatch(
      game.memoryBundle,
      gmResponse,
      turnNumber
    );

    // 8. Save turn to history
    await saveTurn(gameId, turnNumber, playerMoves, gmResponse);
    if (!game.history) game.history = [];
    game.history.push(gmResponse);

    // 9. Clear pending cards, increment turn counter
    for (const player of game.players) {
      player.pendingCard = undefined;
    }
    game.lastPlayerMoves = playerMoves;
    game.turnCounter = turnNumber + 1;
    game.scene_title = gmResponse.scene_title;
    game.previous_response_id = newResponseId ?? null;

    if (gmResponse.game_complete) {
      game.game_complete = true;
    }

    // 10. Trigger story summary every 5 turns (fire-and-forget)
    if (turnNumber > 0 && turnNumber % 5 === 0) {
      generateStorySummary(game).then(() =>
        updateGame(game).catch((err) =>
          console.error("[gm] Failed to save story summary:", err)
        )
      );
    }

    // 11. Save updated game state
    const tSave = Date.now();
    await updateGame(game);
    const tDone = Date.now();
    console.log(`[gm] DB save: ${tDone - tSave}ms | Total: ${tDone - t0}ms`);

    // 12. Return response with debug info
    return NextResponse.json({
      ...gmResponse,
      _debug: {
        systemInstructionsLength: systemInstructions.length,
        turnInputLength: turnInput.length,
        systemInstructions,
        turnInput,
        attempt: gmResponse ? "ok" : "fallback",
        turnNumber,
        timing: {
          promptBuildMs: tPrompt - t0,
          openAiMs: tSave - tPrompt,
          dbSaveMs: tDone - tSave,
          totalMs: tDone - t0,
        },
      },
    });
  } catch (err) {
    console.error("[gm] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
