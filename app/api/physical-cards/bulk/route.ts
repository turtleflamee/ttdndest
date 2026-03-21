import { NextRequest, NextResponse } from "next/server";
import { updatePhysicalCard } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const { cards } = (await req.json()) as {
      cards: Array<{ cardNumber: number; text: string; promptHint?: string }>;
    };

    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json(
        { error: "cards array is required" },
        { status: 400 }
      );
    }

    let updated = 0;
    for (const card of cards) {
      if (!card.cardNumber || !card.text) continue;
      await updatePhysicalCard(card.cardNumber, card.text, card.promptHint);
      updated++;
    }

    return NextResponse.json({ updated });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Bulk update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
