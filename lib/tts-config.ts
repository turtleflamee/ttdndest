import type { TTSConfig } from "./tts-service";

const STORAGE_KEY = "ttdnd_tts_config";

const DEFAULT_CONFIG: TTSConfig = {
  narratorVoiceId: "",
  defaultNpcVoiceId: "",
  model: "eleven_turbo_v2_5",
  stability: 0.5,
  similarityBoost: 0.75,
  speed: 1.0,
  narratorOnly: true,
  gongEnabled: true,
  autoPlay: true,
};

export function loadTTSConfig(): TTSConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CONFIG };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const stored = JSON.parse(raw) as Partial<TTSConfig>;
    return { ...DEFAULT_CONFIG, ...stored };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveTTSConfig(config: TTSConfig): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    console.error("[tts-config] Failed to save TTS config to localStorage");
  }
}

export function getDefaultConfig(): TTSConfig {
  return { ...DEFAULT_CONFIG };
}
