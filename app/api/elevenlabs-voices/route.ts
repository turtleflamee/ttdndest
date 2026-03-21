import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown ElevenLabs error");
      return NextResponse.json(
        { error: `ElevenLabs API error (${res.status}): ${errText}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as { voices: unknown[] };
    return NextResponse.json(data.voices);
  } catch (err) {
    console.error("[elevenlabs-voices] Request failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch voices" },
      { status: 500 }
    );
  }
}
