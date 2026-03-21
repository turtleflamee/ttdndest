import { NextRequest, NextResponse } from "next/server";
import {
  getCardMappings,
  setCardMapping,
  deleteCardMapping,
} from "@/lib/storage";

export async function GET() {
  try {
    const mappings = await getCardMappings();
    return NextResponse.json(mappings);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to get mappings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { rfidUid, physicalCardNumber } = (await req.json()) as {
      rfidUid: string;
      physicalCardNumber: number;
    };

    if (!rfidUid || !physicalCardNumber) {
      return NextResponse.json(
        { error: "rfidUid and physicalCardNumber are required" },
        { status: 400 }
      );
    }

    await setCardMapping(rfidUid, physicalCardNumber);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to set mapping";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { rfidUid } = (await req.json()) as { rfidUid: string };

    if (!rfidUid) {
      return NextResponse.json(
        { error: "rfidUid is required" },
        { status: 400 }
      );
    }

    await deleteCardMapping(rfidUid);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to delete mapping";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
