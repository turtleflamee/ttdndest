import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const FILE_PATH = path.join(process.cwd(), "prompt-sets.json");

function loadSets(): Record<string, Record<string, unknown>> {
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export async function GET() {
  return NextResponse.json(loadSets());
}

export async function POST(req: NextRequest) {
  try {
    const { setCode, data } = await req.json();
    if (!setCode || typeof setCode !== "string") {
      return NextResponse.json({ error: "setCode is required" }, { status: 400 });
    }

    const all = loadSets();
    all[setCode] = { ...(all[setCode] ?? {}), ...data };
    fs.writeFileSync(FILE_PATH, JSON.stringify(all, null, 2));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
