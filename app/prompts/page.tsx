"use client";

import { useState, useEffect } from "react";

interface PromptSet {
  writingStyle?: string;
  introAudioRules?: string;
  systemInstructions?: string;
  turnStyle?: string;
}

type SetCode = "default" | "adventure" | "baby";

const SET_OPTIONS: { value: SetCode; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "adventure", label: "Adventure" },
  { value: "baby", label: "Baby AI" },
];

export default function PromptsPage() {
  const [activeSet, setActiveSet] = useState<SetCode>("default");
  const [data, setData] = useState<PromptSet>({});
  const [allSets, setAllSets] = useState<Record<string, PromptSet>>({});
  const [defaultPrompts, setDefaultPrompts] = useState<PromptSet>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/prompts").then((r) => r.json()),
      fetch("/api/prompts/sets").then((r) => r.json()),
    ])
      .then(([customData, setsData]) => {
        setDefaultPrompts(customData);
        setAllSets(setsData);
        setData(customData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (activeSet === "default") {
      setData({ ...defaultPrompts });
    } else {
      setData({ ...(allSets[activeSet] ?? {}) });
    }
    setPreview(null);
    setSaved(false);
  }, [activeSet]);  // eslint-disable-line react-hooks/exhaustive-deps

  function updateField(field: keyof PromptSet, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (activeSet === "default") {
        await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        setDefaultPrompts({ ...data });
      } else {
        await fetch("/api/prompts/sets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setCode: activeSet, data }),
        });
        setAllSets((prev) => ({ ...prev, [activeSet]: { ...data } }));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // save failed
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/prompt-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setCode: activeSet }),
      });
      const result = await res.json();
      setPreview(result.prompt ?? result.error ?? "No preview available");
    } catch {
      setPreview("Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  const showExtendedFields = activeSet !== "default";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p style={{ color: "var(--text-secondary)" }}>Loading prompts...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">GM Tuning</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Edit prompt overrides for each prompt set
      </p>

      {/* Set Selector */}
      <div className="mb-6">
        <label className="label">Prompt Set</label>
        <select
          className="input"
          style={{ maxWidth: 300 }}
          value={activeSet}
          onChange={(e) => setActiveSet(e.target.value as SetCode)}
        >
          {SET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-5">
        {/* Writing Style */}
        <div>
          <label className="label">Writing Style</label>
          <textarea
            className="textarea"
            style={{ minHeight: 160 }}
            value={data.writingStyle ?? ""}
            onChange={(e) => updateField("writingStyle", e.target.value)}
            placeholder="Writing style rules..."
          />
        </div>

        {/* Intro Audio Rules */}
        <div>
          <label className="label">Intro Audio Rules</label>
          <textarea
            className="textarea"
            style={{ minHeight: 120 }}
            value={data.introAudioRules ?? ""}
            onChange={(e) => updateField("introAudioRules", e.target.value)}
            placeholder="Rules for intro narration audio..."
          />
        </div>

        {/* System Instructions (adventure/baby only) */}
        {showExtendedFields && (
          <div>
            <label className="label">System Instructions</label>
            <textarea
              className="textarea"
              style={{ minHeight: 200 }}
              value={data.systemInstructions ?? ""}
              onChange={(e) => updateField("systemInstructions", e.target.value)}
              placeholder="Full system instructions for the GM..."
            />
          </div>
        )}

        {/* Turn Style (adventure/baby only) */}
        {showExtendedFields && (
          <div>
            <label className="label">Turn Style</label>
            <textarea
              className="textarea"
              style={{ minHeight: 120 }}
              value={data.turnStyle ?? ""}
              onChange={(e) => updateField("turnStyle", e.target.value)}
              placeholder="Turn style checklist..."
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-6">
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saved ? "Saved!" : saving ? "Saving..." : "Save"}
        </button>
        <button
          className="btn btn-ghost"
          onClick={handlePreview}
          disabled={previewLoading}
        >
          {previewLoading ? "Loading..." : "Preview Assembled Prompt"}
        </button>
      </div>

      {/* Preview Panel */}
      {preview !== null && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Assembled Prompt Preview
            </h3>
            <button
              className="text-xs cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
              onClick={() => setPreview(null)}
            >
              Close
            </button>
          </div>
          <pre
            className="card text-xs overflow-auto whitespace-pre-wrap font-mono"
            style={{ maxHeight: 400, color: "var(--text-secondary)" }}
          >
            {preview}
          </pre>
        </div>
      )}
    </div>
  );
}
