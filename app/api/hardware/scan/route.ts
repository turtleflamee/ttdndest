import { NextRequest, NextResponse } from "next/server";
import {
  getPlateByToken,
  getGame,
  updateGame,
  getPhysicalCardByNumber,
  getPhysicalCardByRfidUid,
} from "@/lib/storage";

async function resolveCard(
  rfidUid: string,
  cardNumber?: number
): Promise<{ cardNumber: number; cardText: string } | null> {
  if (cardNumber) {
    const card = await getPhysicalCardByNumber(cardNumber);
    if (!card) return null;
    return { cardNumber: card.card_number, cardText: card.text };
  }

  const mapping = await getPhysicalCardByRfidUid(rfidUid);
  if (!mapping?.physical_cards) return null;
  return {
    cardNumber: mapping.physical_cards.card_number,
    cardText: mapping.physical_cards.text,
  };
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const plate = await getPlateByToken(token);
    if (!plate) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { readerIndex, rfidUid, cardNumber } = (await req.json()) as {
      plateId: string;
      readerIndex: number;
      rfidUid: string;
      cardNumber?: number;
    };

    if (!plate.active_game_id) {
      return NextResponse.json(
        { error: "No active game on this plate" },
        { status: 409 }
      );
    }

    const game = await getGame(plate.active_game_id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const resolved = await resolveCard(rfidUid, cardNumber);
    if (!resolved) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const playerIndex = readerIndex - 1;
    const player = game.players[playerIndex];
    if (!player) {
      return NextResponse.json(
        { error: `No player at reader index ${readerIndex}` },
        { status: 400 }
      );
    }

    player.pendingCard = {
      cardId: `physical-${resolved.cardNumber}`,
      cardText: resolved.cardText,
    };

    console.log(`[hardware/scan] Setting pendingCard for player ${playerIndex} (${player.name}): card #${resolved.cardNumber} "${resolved.cardText}"`);

    game.updatedAt = new Date().toISOString();
    await updateGame(game);

    console.log(`[hardware/scan] Game ${game.id} updated successfully`);

    return NextResponse.json({
      success: true,
      cardNumber: resolved.cardNumber,
      cardText: resolved.cardText,
      playerName: player.name,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Scan failed";
    console.error("[hardware/scan] POST error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const plateId = req.nextUrl.searchParams.get("plateId");
    if (!plateId) {
      return NextResponse.json({ error: "plateId required" }, { status: 400 });
    }

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const plate = await getPlateByToken(token);
    if (!plate) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!plate.active_game_id) {
      return NextResponse.json({
        hasActiveGame: false,
        gameName: null,
        turnNumber: null,
        players: [],
      });
    }

    const game = await getGame(plate.active_game_id);
    if (!game) {
      return NextResponse.json({
        hasActiveGame: false,
        gameName: null,
        turnNumber: null,
        players: [],
      });
    }

    return NextResponse.json({
      hasActiveGame: true,
      gameName: game.name,
      turnNumber: game.turnCounter,
      players: game.players.map((p) => ({
        name: p.name,
        hasSubmitted: !!p.pendingCard,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Status check failed";
    console.error("[hardware/scan] GET error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
