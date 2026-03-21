import { NextResponse } from "next/server";
import { listScenarioSummaries } from "@/lib/scenarios/loader";

export async function GET() {
  try {
    const summaries = listScenarioSummaries();
    return NextResponse.json(summaries);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to list scenarios";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
