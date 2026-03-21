import { NextResponse } from "next/server";
import { getGameByPlayerCode } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    const { code } = await req.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const result = await getGameByPlayerCode(code.trim());

    if (!result) {
      return NextResponse.json(
        { error: "No game found for that code" },
        { status: 404 }
      );
    }

    const { game, playerIndex } = result;
    const player = game.players[playerIndex];

    return NextResponse.json({
      gameId: game.id,
      playerIndex,
      playerName: player.name,
      gameName: game.name,
    });
  } catch (err) {
    console.error("Player validate error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
