import { NextRequest, NextResponse } from "next/server";
import { buildSystemInstructions, buildTurnInput } from "@/lib/prompt-assembly";
import { loadScenario } from "@/lib/scenarios/loader";
import { EMPTY_MEMORY_BUNDLE } from "@/lib/defaults";
import type { PlayerSlot, GameMode } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      promptSetCode,
      scenarioId,
      playerNames,
      gameMode,
    } = body as {
      promptSetCode?: string;
      scenarioId?: string;
      playerNames: string[];
      gameMode?: GameMode;
    };

    if (!Array.isArray(playerNames) || playerNames.length === 0) {
      return NextResponse.json(
        { error: "playerNames must be a non-empty array" },
        { status: 400 }
      );
    }

    const players: PlayerSlot[] = playerNames.map((name, i) => ({
      index: i,
      name,
    }));

    const scenario = scenarioId ? loadScenario(scenarioId) : undefined;
    const memoryBundle = { ...EMPTY_MEMORY_BUNDLE };

    if (scenario) {
      memoryBundle.known_locations = scenario.locations.map((l) => l.name);
      if (scenario.locations.length > 0) {
        memoryBundle.current_location = scenario.locations[0].name;
      }
      memoryBundle.story_beats = scenario.story_arc.map((b) => ({ ...b }));
    }

    const systemInstructions = buildSystemInstructions({
      players,
      scenario: scenario ?? undefined,
      memoryBundle,
      turnNumber: 0,
      gameMode,
      promptSetCode,
    });

    const turnInput = buildTurnInput({
      players,
      moves: [],
      turnNumber: 0,
      promptSetCode,
    });

    return NextResponse.json({ systemInstructions, turnInput });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to generate prompt preview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
