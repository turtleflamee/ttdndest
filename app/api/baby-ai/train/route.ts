import { NextResponse } from "next/server";
import { runTrainingIteration } from "@/lib/baby-ai-trainer";

export async function POST() {
  try {
    const result = await runTrainingIteration();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Training failed";
    console.error("[baby-ai/train]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
