export interface SpeechSegment {
  type: "narration" | "dialogue";
  text: string;
  speaker?: string;
  emotion?: string;
}

export interface TTSConfig {
  narratorVoiceId: string;
  defaultNpcVoiceId: string;
  model: string;
  stability: number;
  similarityBoost: number;
  speed: number;
  narratorOnly: boolean;
  gongEnabled: boolean;
  autoPlay: boolean;
}

export function parseNarrationToSegments(
  narration: string,
  dialogue?: Array<{ speaker: string; line: string; emotion?: string }>
): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  const quoteRegex = /"([^"]+)"/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = quoteRegex.exec(narration)) !== null) {
    const before = narration.slice(lastIndex, match.index).trim();
    if (before) {
      segments.push({ type: "narration", text: before });
    }

    const quotedText = match[1];
    let speaker: string | undefined;
    let emotion: string | undefined;

    if (dialogue) {
      const matched = dialogue?.find(
        (d) =>
          d.line &&
          (d.line === quotedText ||
          d.line.includes(quotedText) ||
          quotedText.includes(d.line))
      );
      if (matched) {
        speaker = matched.speaker;
        emotion = matched.emotion;
      }
    }

    segments.push({
      type: "dialogue",
      text: quotedText,
      speaker,
      emotion,
    });

    lastIndex = match.index + match[0].length;
  }

  const remaining = narration.slice(lastIndex).trim();
  if (remaining) {
    segments.push({ type: "narration", text: remaining });
  }

  if (segments.length === 0 && narration.trim()) {
    segments.push({ type: "narration", text: narration.trim() });
  }

  return segments;
}

export async function generateSegmentAudio(
  segment: SpeechSegment,
  config: TTSConfig,
  characterVoices?: Record<string, string>
): Promise<ArrayBuffer> {
  let voiceId = config.narratorVoiceId;

  if (segment.type === "dialogue" && !config.narratorOnly) {
    if (segment.speaker && characterVoices?.[segment.speaker]) {
      voiceId = characterVoices[segment.speaker];
    } else {
      voiceId = config.defaultNpcVoiceId || config.narratorVoiceId;
    }
  }

  if (!voiceId) {
    throw new Error(
      "No TTS voice configured. Go to Settings and select a narrator voice."
    );
  }

  const res = await fetch("/api/tts-elevenlabs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: segment.text,
      voiceId,
      model: config.model,
      stability: config.stability,
      similarityBoost: config.similarityBoost,
      speed: config.speed,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`TTS generation failed (${res.status}): ${errText}`);
  }

  return res.arrayBuffer();
}

type PlayerState = "idle" | "generating" | "playing" | "paused";

export class TTSPlayer {
  segments: SpeechSegment[] = [];
  audioCache: Map<number, ArrayBuffer> = new Map();
  currentSegmentIndex = 0;
  isPlaying = false;
  isPaused = false;
  audioContext: AudioContext | null = null;
  currentSource: AudioBufferSourceNode | null = null;

  onSegmentStart?: (index: number) => void;
  onSegmentEnd?: (index: number) => void;
  onComplete?: () => void;

  private state: PlayerState = "idle";
  private stopRequested = false;
  private pauseResolver: (() => void) | null = null;

  getState(): PlayerState {
    return this.state;
  }

  async loadAndPlay(
    narration: string,
    dialogue: Array<{ speaker: string; line: string; emotion?: string }>,
    config: TTSConfig,
    characterVoices?: Record<string, string>
  ): Promise<void> {
    this.stop();

    this.segments = parseNarrationToSegments(narration, dialogue);
    this.audioCache.clear();
    this.currentSegmentIndex = 0;
    this.isPlaying = true;
    this.isPaused = false;
    this.stopRequested = false;
    this.state = "generating";

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    if (config.gongEnabled) {
      await this.playGong();
      if (this.stopRequested) return;
    }

    this.state = "playing";

    for (let i = 0; i < this.segments.length; i++) {
      if (this.stopRequested) break;

      this.currentSegmentIndex = i;

      let audioBuffer: ArrayBuffer;
      if (this.audioCache.has(i)) {
        audioBuffer = this.audioCache.get(i)!;
      } else {
        this.state = "generating";
        audioBuffer = await generateSegmentAudio(
          this.segments[i],
          config,
          characterVoices
        );
        this.audioCache.set(i, audioBuffer);
        if (this.stopRequested) break;
        this.state = "playing";
      }

      if (this.isPaused) {
        this.state = "paused";
        await new Promise<void>((resolve) => {
          this.pauseResolver = resolve;
        });
        if (this.stopRequested) break;
        this.state = "playing";
      }

      this.onSegmentStart?.(i);
      await this.playBuffer(audioBuffer);
      this.onSegmentEnd?.(i);
    }

    this.isPlaying = false;
    this.state = "idle";
    if (!this.stopRequested) {
      this.onComplete?.();
    }
  }

  pause(): void {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    this.state = "paused";

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // already stopped
      }
    }
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.state = "playing";

    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
  }

  stop(): void {
    this.stopRequested = true;
    this.isPlaying = false;
    this.isPaused = false;
    this.state = "idle";

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // already stopped
      }
      this.currentSource = null;
    }

    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
  }

  async replay(
    config: TTSConfig,
    characterVoices?: Record<string, string>
  ): Promise<void> {
    if (this.segments.length === 0) return;

    this.stopRequested = false;
    this.currentSegmentIndex = 0;
    this.isPlaying = true;
    this.isPaused = false;

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    if (config.gongEnabled) {
      await this.playGong();
      if (this.stopRequested) return;
    }

    this.state = "playing";

    for (let i = 0; i < this.segments.length; i++) {
      if (this.stopRequested) break;

      this.currentSegmentIndex = i;

      let audioBuffer: ArrayBuffer;
      if (this.audioCache.has(i)) {
        audioBuffer = this.audioCache.get(i)!;
      } else {
        this.state = "generating";
        audioBuffer = await generateSegmentAudio(
          this.segments[i],
          config,
          characterVoices
        );
        this.audioCache.set(i, audioBuffer);
        if (this.stopRequested) break;
        this.state = "playing";
      }

      if (this.isPaused) {
        this.state = "paused";
        await new Promise<void>((resolve) => {
          this.pauseResolver = resolve;
        });
        if (this.stopRequested) break;
        this.state = "playing";
      }

      this.onSegmentStart?.(i);
      await this.playBuffer(audioBuffer);
      this.onSegmentEnd?.(i);
    }

    this.isPlaying = false;
    this.state = "idle";
    if (!this.stopRequested) {
      this.onComplete?.();
    }
  }

  private async playGong(): Promise<void> {
    if (!this.audioContext) return;

    try {
      const res = await fetch("/audio/gong.mp3");
      if (!res.ok) return;
      const buffer = await res.arrayBuffer();
      await this.playBuffer(buffer);
    } catch {
      // gong file missing or failed — continue without it
    }
  }

  private async playBuffer(buffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext || this.stopRequested) return;

    const decoded = await this.audioContext.decodeAudioData(buffer.slice(0));
    const source = this.audioContext.createBufferSource();
    source.buffer = decoded;
    source.connect(this.audioContext.destination);
    this.currentSource = source;

    return new Promise<void>((resolve) => {
      source.onended = () => {
        if (this.currentSource === source) {
          this.currentSource = null;
        }
        resolve();
      };
      source.start(0);
    });
  }
}
