import { NextResponse } from "next/server";
import { loadBabyPromptSet, saveBabyPromptSet } from "@/lib/baby-ai-trainer";

export async function POST() {
  try {
    const babySet = loadBabyPromptSet();
    if (!babySet) {
      return NextResponse.json(
        { error: "Baby prompt set not found" },
        { status: 404 }
      );
    }

    babySet.writingStyle = "";
    saveBabyPromptSet(babySet);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    console.error("[baby-ai/reset]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
