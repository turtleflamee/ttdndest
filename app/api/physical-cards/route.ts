import { NextRequest, NextResponse } from "next/server";
import { getPhysicalCards, updatePhysicalCard } from "@/lib/storage";

export async function GET() {
  try {
    const cards = await getPhysicalCards();
    return NextResponse.json(cards);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to get cards";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { cardNumber, text, promptHint } = (await req.json()) as {
      cardNumber: number;
      text: string;
      promptHint?: string;
    };

    if (!cardNumber || !text) {
      return NextResponse.json(
        { error: "cardNumber and text are required" },
        { status: 400 }
      );
    }

    await updatePhysicalCard(cardNumber, text, promptHint);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to update card";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
