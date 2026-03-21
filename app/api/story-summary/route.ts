import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getGame, updateGame } from "@/lib/storage";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const { gameId } = (await req.json()) as { gameId: string };
    if (!gameId) {
      return NextResponse.json({ error: "gameId is required" }, { status: 400 });
    }

    const game = await getGame(gameId);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const history = game.history ?? [];
    if (history.length === 0) {
      return NextResponse.json(
        { error: "No history to summarize" },
        { status: 400 }
      );
    }

    const historyText = history
      .map(
        (t) =>
          `Turn ${t.turn} — ${t.scene_title}: ${t.narration.slice(0, 400)}`
      )
      .join("\n\n");

    const playerNames = game.players
      .map((p) => p.character ?? p.name)
      .join(", ");

    const result = await getOpenAI().responses.create({
      model: "gpt-4o-mini",
      instructions:
        "You are a story summarizer for a tabletop RPG. Given a sequence of turns, produce a concise 2-3 paragraph summary of the story so far. Focus on major events, character development, and unresolved threads. Return ONLY the summary text, no JSON or markdown formatting.",
      input: `Game: "${game.name}"\nPlayers: ${playerNames}\n\n${historyText}`,
    });

    const summary = result.output_text?.trim() ?? "";
    if (!summary) {
      return NextResponse.json(
        { error: "Failed to generate summary" },
        { status: 500 }
      );
    }

    game.memoryBundle.story_summary = summary;
    game.updatedAt = new Date().toISOString();
    await updateGame(game);

    return NextResponse.json({ summary });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Summary generation failed";
    console.error("[story-summary] error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
