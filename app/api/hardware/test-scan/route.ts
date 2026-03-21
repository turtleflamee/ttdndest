import { NextRequest, NextResponse } from "next/server";
import {
  getPlateByToken,
  getPlate,
  updatePlate,
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

    const { rfidUid, readerIndex, cardNumber } = (await req.json()) as {
      rfidUid: string;
      readerIndex: number;
      cardNumber?: number;
    };

    const resolved = await resolveCard(rfidUid, cardNumber);

    const scanEntry = {
      rfidUid,
      readerIndex: readerIndex ?? null,
      cardNumber: resolved?.cardNumber ?? null,
      cardText: resolved?.cardText ?? null,
      timestamp: new Date().toISOString(),
    };

    // Store current scan + history of last 20 scans all in last_test_scan JSONB
    const prev = plate.last_test_scan as Record<string, unknown> | null;
    const prevHistory = Array.isArray(prev?.history) ? (prev.history as unknown[]) : [];
    const testScan = {
      ...scanEntry,
      history: [scanEntry, ...prevHistory].slice(0, 20),
    };

    await updatePlate(plate.id, { last_test_scan: testScan });

    if (resolved) {
      return NextResponse.json({
        status: "verified",
        rfidUid,
        readerIndex: readerIndex ?? null,
        cardNumber: resolved.cardNumber,
        cardText: resolved.cardText,
      });
    }

    return NextResponse.json({ status: "unknown", rfidUid, readerIndex: readerIndex ?? null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Test scan failed";
    console.error("[hardware/test-scan] POST error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const plateId = req.nextUrl.searchParams.get("plateId");
    if (!plateId) {
      return NextResponse.json({ error: "plateId required" }, { status: 400 });
    }

    const plate = await getPlate(plateId);
    if (!plate) {
      return NextResponse.json({ error: "Plate not found" }, { status: 404 });
    }

    return NextResponse.json(plate.last_test_scan ?? null);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to get test scan";
    console.error("[hardware/test-scan] GET error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
