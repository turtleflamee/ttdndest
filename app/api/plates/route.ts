import { NextRequest, NextResponse } from "next/server";
import { listPlates, createPlate } from "@/lib/storage";

export async function GET() {
  try {
    const plates = await listPlates();
    return NextResponse.json(plates);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to list plates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name } = (await req.json()) as { name: string };

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const plate = await createPlate(name);
    return NextResponse.json(plate, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to create plate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
