import { NextResponse } from "next/server";
import { loadTrainingHistory } from "@/lib/baby-ai-trainer";

export async function GET() {
  try {
    const history = loadTrainingHistory();
    return NextResponse.json(history);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load history";
    console.error("[baby-ai/history]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
