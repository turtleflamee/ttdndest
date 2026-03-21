import { NextResponse } from "next/server";
import { getGame, updateGame } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    const { gameId } = await req.json();

    if (!gameId) {
      return NextResponse.json(
        { error: "gameId is required" },
        { status: 400 }
      );
    }

    const game = await getGame(gameId);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    game.replayRequested = true;
    await updateGame(game);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Request replay error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
