"use client";

import { useState, useEffect } from "react";

interface EvaluatorResult {
  overall_score: number;
  score_intro: number;
  scores_rounds: number[];
  top_3_changes_intro: string[];
  top_3_changes_rounds: string[];
  summary: string;
  raw: string;
}

interface TrainingResult {
  iteration: number;
  score: EvaluatorResult;
  rulesChanged: boolean;
  story: string;
  timestamp: string;
}

interface BabyPromptSet {
  systemInstructions?: string;
  turnStyle?: string;
  writingStyle?: string;
  introAudioRules?: string;
}

export default function BabyAIPage() {
  const [instructions, setInstructions] = useState<BabyPromptSet>({});
  const [history, setHistory] = useState<TrainingResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [latestResult, setLatestResult] = useState<TrainingResult | null>(null);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/prompts/sets").then((r) => r.json()),
      fetch("/api/baby-ai/history").then((r) => r.json()),
    ])
      .then(([sets, hist]) => {
        setInstructions(sets.baby ?? {});
        if (Array.isArray(hist)) setHistory(hist);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleTrain() {
    setTraining(true);
    setLatestResult(null);
    try {
      const res = await fetch("/api/baby-ai/train", { method: "POST" });
      const result: TrainingResult = await res.json();
      setLatestResult(result);
      setHistory((prev) => [...prev, result]);

      const setsRes = await fetch("/api/prompts/sets");
      const sets = await setsRes.json();
      setInstructions(sets.baby ?? {});
    } catch {
      // training failed
    } finally {
      setTraining(false);
    }
  }

  async function handleReset() {
    if (!confirm("Clear all learned writing rules? This cannot be undone.")) return;
    setResetting(true);
    try {
      await fetch("/api/baby-ai/reset", { method: "POST" });
      const setsRes = await fetch("/api/prompts/sets");
      const sets = await setsRes.json();
      setInstructions(sets.baby ?? {});
    } catch {
      // reset failed
    } finally {
      setResetting(false);
    }
  }

  function scoreColor(score: number): string {
    if (score >= 8) return "var(--success)";
    if (score >= 6) return "var(--warning)";
    return "var(--danger)";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p style={{ color: "var(--text-secondary)" }}>Loading Baby AI...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Baby AI Trainer</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Train the Baby AI prompt set via automated evaluation loops
      </p>

      {/* Instructions Panel */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--accent)" }}>
            Current Baby AI Instructions
          </h2>
          <a
            href="/prompts"
            className="text-xs"
            style={{ color: "var(--accent)" }}
          >
            Edit in GM Tuning
          </a>
        </div>

        <div className="space-y-3">
          <div>
            <div className="label">System Instructions</div>
            <pre
              className="text-xs whitespace-pre-wrap overflow-auto rounded-lg p-3"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                maxHeight: 200,
              }}
            >
              {instructions.systemInstructions || "(empty)"}
            </pre>
          </div>

          <div>
            <div className="label">Turn Style</div>
            <pre
              className="text-xs whitespace-pre-wrap overflow-auto rounded-lg p-3"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                maxHeight: 150,
              }}
            >
              {instructions.turnStyle || "(empty)"}
            </pre>
          </div>

          <div>
            <div className="label">Learned Writing Rules</div>
            <pre
              className="text-xs whitespace-pre-wrap overflow-auto rounded-lg p-3"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                maxHeight: 150,
              }}
            >
              {instructions.writingStyle || "(empty — not yet trained)"}
            </pre>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mb-6">
        <button
          className="btn btn-primary"
          onClick={handleTrain}
          disabled={training}
        >
          {training ? (
            <span className="flex items-center gap-2">
              <Spinner /> Training...
            </span>
          ) : (
            "Train"
          )}
        </button>
        <button
          className="btn btn-danger"
          onClick={handleReset}
          disabled={resetting || training}
        >
          {resetting ? "Resetting..." : "Reset Learned Rules"}
        </button>
      </div>

      {/* Latest Result */}
      {latestResult && (
        <div className="card mb-6">
          <h3 className="text-base font-semibold mb-3" style={{ color: "var(--accent)" }}>
            Training Result — Iteration {latestResult.iteration}
          </h3>
          <ResultDisplay result={latestResult} scoreColor={scoreColor} />
        </div>
      )}

      {/* Training History */}
      <div>
        <h2 className="text-lg font-bold mb-3">Training History</h2>
        {history.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No training runs yet.
          </p>
        ) : (
          <div className="space-y-2">
            {[...history].reverse().map((run) => (
              <div key={run.iteration} className="card">
                <button
                  className="w-full text-left flex items-center justify-between cursor-pointer"
                  onClick={() =>
                    setExpandedRun(
                      expandedRun === run.iteration ? null : run.iteration
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      #{run.iteration}
                    </span>
                    <span
                      className="text-sm font-bold"
                      style={{ color: scoreColor(run.score.overall_score) }}
                    >
                      {run.score.overall_score}/10
                    </span>
                    {run.rulesChanged && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: "rgba(108,92,231,0.2)",
                          color: "var(--accent)",
                        }}
                      >
                        rules updated
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {new Date(run.timestamp).toLocaleString()}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {expandedRun === run.iteration ? "▲" : "▼"}
                    </span>
                  </div>
                </button>

                {expandedRun === run.iteration && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <ResultDisplay result={run} scoreColor={scoreColor} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultDisplay({
  result,
  scoreColor,
}: {
  result: TrainingResult;
  scoreColor: (s: number) => string;
}) {
  const [showStory, setShowStory] = useState(false);

  return (
    <div className="space-y-3">
      {/* Scores */}
      <div className="flex flex-wrap gap-4">
        <ScoreBadge
          label="Overall"
          score={result.score.overall_score}
          color={scoreColor(result.score.overall_score)}
        />
        <ScoreBadge
          label="Intro"
          score={result.score.score_intro}
          color={scoreColor(result.score.score_intro)}
        />
        {result.score.scores_rounds.map((s, i) => (
          <ScoreBadge
            key={i}
            label={`Round ${i + 1}`}
            score={s}
            color={scoreColor(s)}
          />
        ))}
      </div>

      {/* Summary */}
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {result.score.summary}
      </p>

      {/* Changes */}
      {result.score.top_3_changes_intro.length > 0 && (
        <div>
          <div className="label">Suggested Intro Changes</div>
          <ul className="text-xs space-y-1" style={{ color: "var(--text-secondary)" }}>
            {result.score.top_3_changes_intro.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      )}
      {result.score.top_3_changes_rounds.length > 0 && (
        <div>
          <div className="label">Suggested Round Changes</div>
          <ul className="text-xs space-y-1" style={{ color: "var(--text-secondary)" }}>
            {result.score.top_3_changes_rounds.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Story toggle */}
      <button
        className="text-xs cursor-pointer"
        style={{ color: "var(--accent)" }}
        onClick={() => setShowStory(!showStory)}
      >
        {showStory ? "Hide generated story" : "Show generated story"}
      </button>
      {showStory && (
        <pre
          className="text-xs whitespace-pre-wrap overflow-auto rounded-lg p-3"
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            maxHeight: 300,
          }}
        >
          {result.story}
        </pre>
      )}
    </div>
  );
}

function ScoreBadge({
  label,
  score,
  color,
}: {
  label: string;
  score: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold" style={{ color }}>
        {score}
      </div>
      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <circle cx="12" cy="12" r="10" opacity={0.25} />
      <path d="M12 2a10 10 0 0 1 10 10" opacity={0.75} />
    </svg>
  );
}
