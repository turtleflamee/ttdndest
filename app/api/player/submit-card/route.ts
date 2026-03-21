import { NextResponse } from "next/server";
import { getGame, updateGame } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    const { gameId, playerIndex, cardId, cardText } = await req.json();

    if (!gameId || playerIndex == null || !cardId || !cardText) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const game = await getGame(gameId);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const player = game.players[playerIndex];
    if (!player) {
      return NextResponse.json(
        { error: "Invalid player index" },
        { status: 400 }
      );
    }

    if (player.pendingCard) {
      return NextResponse.json(
        { error: "Card already submitted this turn" },
        { status: 409 }
      );
    }

    player.pendingCard = { cardId, cardText };

    console.log(`[submit-card] Player ${playerIndex} (${player.name}) submitting: "${cardText}" (${cardId})`);

    try {
      await updateGame(game);
      console.log(`[submit-card] Game ${gameId} saved successfully`);
    } catch (saveErr) {
      console.error(`[submit-card] SAVE FAILED for game ${gameId}:`, saveErr);
      return NextResponse.json(
        { error: "Failed to save card submission" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Submit card error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
