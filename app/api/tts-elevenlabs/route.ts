import { NextRequest, NextResponse } from "next/server";

interface TTSRequestBody {
  text: string;
  voiceId: string;
  model?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: TTSRequestBody;
  try {
    body = (await req.json()) as TTSRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text, voiceId } = body;
  if (!text || !voiceId) {
    return NextResponse.json(
      { error: "text and voiceId are required" },
      { status: 400 }
    );
  }

  const model = body.model ?? "eleven_turbo_v2_5";
  const stability = body.stability ?? 0.5;
  const similarityBoost = body.similarityBoost ?? 0.75;
  const speed = body.speed ?? 1.0;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            speed,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown ElevenLabs error");
      return NextResponse.json(
        { error: `ElevenLabs API error (${res.status}): ${errText}` },
        { status: res.status }
      );
    }

    const audioBuffer = await res.arrayBuffer();
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[tts-elevenlabs] Request failed:", err);
    return NextResponse.json(
      { error: "Failed to generate speech" },
      { status: 500 }
    );
  }
}
