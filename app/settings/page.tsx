"use client";

import { useState, useEffect } from "react";
import { loadTTSConfig, saveTTSConfig, getDefaultConfig } from "@/lib/tts-config";
import type { TTSConfig } from "@/lib/tts-service";

interface Voice {
  voice_id: string;
  name: string;
  category?: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<TTSConfig>(getDefaultConfig());
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig(loadTTSConfig());

    fetch("/api/elevenlabs-voices")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setVoices(data);
      })
      .catch(() => {})
      .finally(() => setLoadingVoices(false));
  }, []);

  function update<K extends keyof TTSConfig>(key: K, value: TTSConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    saveTTSConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    const defaults = getDefaultConfig();
    setConfig(defaults);
    saveTTSConfig(defaults);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">TTS Settings</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        ElevenLabs voice configuration
      </p>

      <div className="space-y-6">
        {/* Voice Selection */}
        <div className="card space-y-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--accent)" }}>
            Voice Selection
          </h2>

          <div>
            <label className="label">Narrator Voice</label>
            <select
              className="input"
              value={config.narratorVoiceId}
              onChange={(e) => update("narratorVoiceId", e.target.value)}
              disabled={loadingVoices}
            >
              <option value="">
                {loadingVoices ? "Loading voices..." : "Select a voice"}
              </option>
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name} {v.category ? `(${v.category})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Default NPC Voice</label>
            <select
              className="input"
              value={config.defaultNpcVoiceId}
              onChange={(e) => update("defaultNpcVoiceId", e.target.value)}
              disabled={loadingVoices}
            >
              <option value="">
                {loadingVoices ? "Loading voices..." : "Select a voice"}
              </option>
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name} {v.category ? `(${v.category})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Model */}
        <div className="card space-y-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--accent)" }}>
            TTS Model
          </h2>
          <div>
            <label className="label">Model</label>
            <select
              className="input"
              value={config.model}
              onChange={(e) => update("model", e.target.value)}
            >
              <option value="eleven_turbo_v2_5">Turbo v2.5 (fastest)</option>
              <option value="eleven_multilingual_v2">Multilingual v2 (highest quality)</option>
            </select>
          </div>
        </div>

        {/* Voice Parameters */}
        <div className="card space-y-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--accent)" }}>
            Voice Parameters
          </h2>

          <SliderRow
            label="Stability"
            value={config.stability}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update("stability", v)}
          />
          <SliderRow
            label="Similarity"
            value={config.similarityBoost}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update("similarityBoost", v)}
          />
          <SliderRow
            label="Speed"
            value={config.speed}
            min={0.5}
            max={2.0}
            step={0.05}
            onChange={(v) => update("speed", v)}
          />
        </div>

        {/* Toggles */}
        <div className="card space-y-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--accent)" }}>
            Playback
          </h2>

          <ToggleRow
            label="Narrator-only mode"
            description="All text uses the narrator voice (skips NPC voices)"
            checked={config.narratorOnly}
            onChange={(v) => update("narratorOnly", v)}
          />
          <ToggleRow
            label="Gong chime"
            description="Play a gong sound before narration starts"
            checked={config.gongEnabled}
            onChange={(v) => update("gongEnabled", v)}
          />
          <ToggleRow
            label="Auto-play"
            description="Automatically play TTS after each GM turn"
            checked={config.autoPlay}
            onChange={(v) => update("autoPlay", v)}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? "Saved!" : "Save"}
          </button>
          <button className="btn btn-ghost" onClick={handleReset}>
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="label mb-0">{label}</label>
        <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      <div
        className="flex justify-between text-xs mt-0.5"
        style={{ color: "var(--text-secondary)" }}
      >
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="pt-0.5">
        <div
          onClick={() => onChange(!checked)}
          className="w-10 h-5 rounded-full transition-colors relative cursor-pointer"
          style={{
            background: checked ? "var(--accent)" : "var(--border)",
          }}
        >
          <div
            className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all"
            style={{ left: checked ? "22px" : "2px" }}
          />
        </div>
      </div>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {description}
        </div>
      </div>
    </label>
  );
}
