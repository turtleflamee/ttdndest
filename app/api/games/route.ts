import { NextRequest, NextResponse } from "next/server";
import { listGames, createGame, updatePlate } from "@/lib/storage";
import {
  createShuffledDeck,
  drawCards,
  HAND_SIZE,
  EMPTY_MEMORY_BUNDLE,
  DEFAULT_RULES_TEXT,
} from "@/lib/defaults";
import type { GameState, PlayerSlot, MemoryBundle, StoryBeat } from "@/lib/types";
import { loadScenario } from "@/lib/scenarios/loader";

function generateCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function GET() {
  try {
    const games = await listGames();
    return NextResponse.json(games);
  } catch (e: unknown) {
    console.error("[api/games] GET error:", e);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      playerCount,
      playerNames,
      scenarioId,
      gameMode,
      deckType,
      promptSetCode,
      inputMode,
      plateId,
      archetypes,
      partyInputType,
      partyTimerSeconds,
    } = body as {
      name: string;
      playerCount: number;
      playerNames: string[];
      scenarioId?: string;
      gameMode?: string;
      deckType?: string;
      promptSetCode?: string;
      inputMode?: "phone" | "plate" | "party";
      plateId?: string;
      archetypes?: string[];
      partyInputType?: "cards" | "free-text" | "speech";
      partyTimerSeconds?: number;
    };

    const players: PlayerSlot[] = playerNames.map((pName, i) => ({
      index: i,
      name: pName,
      code: generateCode(),
      archetype: archetypes?.[i],
    }));

    // Only create digital deck for phone mode or party+cards mode
    // Plate mode uses physical RFID cards, party free-text/speech has no deck
    let deck = undefined;
    const needsDeck = inputMode === "phone" || (inputMode === "party" && partyInputType === "cards");
    if (needsDeck) {
      let deckState = createShuffledDeck(
        deckType as "adventure" | "party" | "horror" | "cyberpunk" | undefined,
      );
      for (const player of players) {
        const { deck: updated, drawn } = drawCards(deckState, HAND_SIZE);
        deckState = updated;
        player.hand = drawn;
      }
      deck = deckState;
    }

    const memoryBundle: MemoryBundle = { ...EMPTY_MEMORY_BUNDLE };

    if (scenarioId) {
      const scenario = loadScenario(scenarioId);
      if (scenario) {
        memoryBundle.known_locations = scenario.locations.map((l) => l.name);
        if (scenario.locations.length > 0) {
          memoryBundle.current_location = scenario.locations[0].name;
        }
        memoryBundle.story_beats = scenario.story_arc.map(
          (b): StoryBeat => ({ ...b }),
        );
      }
    }

    const game: GameState = {
      id: crypto.randomUUID(),
      name,
      playerCount,
      players,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turnCounter: 0,
      previous_response_id: null,
      rulesText: DEFAULT_RULES_TEXT,
      deck,
      memoryBundle,
      history: [],
      game_mode: (gameMode as GameState["game_mode"]) ?? "short",
      scenario_id: scenarioId,
      prompt_set_code: promptSetCode,
      input_mode: inputMode,
      plate_id: plateId,
      party_input_type: partyInputType,
      party_timer_seconds: partyTimerSeconds,
    };

    const saved = await createGame(game);

    if (inputMode === "plate" && plateId) {
      try {
        await updatePlate(plateId, { active_game_id: saved.id });
      } catch (plateErr) {
        console.error("[api/games] Failed to activate plate, game still created:", plateErr);
      }
    }

    return NextResponse.json(saved, { status: 201 });
  } catch (e: unknown) {
    console.error("[api/games] POST error:", e);
    const message = e instanceof Error ? e.message : JSON.stringify(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
