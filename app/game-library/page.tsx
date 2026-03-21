"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface GameSummary {
  id: string;
  name: string;
  playerCount: number;
  turnCounter: number;
  updatedAt: string;
  game_mode?: string;
  game_complete?: boolean;
}

interface ScenarioOption {
  id: string;
  name: string;
  description: string;
}

interface PlateOption {
  id: string;
  name?: string;
  active_game_id?: string | null;
}

const PLAYER_COUNTS = [2, 3, 4] as const;
const GAME_LENGTHS = ["short", "long", "infinite"] as const;
const PROMPT_SETS = [
  { code: "default", label: "Default" },
  { code: "adventure", label: "Adventure" },
  { code: "baby", label: "Baby AI" },
];
const DECK_TYPES = ["adventure", "party", "horror", "cyberpunk"] as const;
const ARCHETYPES = [
  "warrior",
  "rogue",
  "scholar",
  "healer",
  "trickster",
  "noble",
  "outlaw",
  "mystic",
] as const;

export default function GameLibraryPage() {
  const router = useRouter();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([]);
  const [plates, setPlates] = useState<PlateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form state
  const [campaignName, setCampaignName] = useState("");
  const [playerCount, setPlayerCount] = useState<number>(3);
  const [playerNames, setPlayerNames] = useState<string[]>(["", "", ""]);
  const [scenarioId, setScenarioId] = useState("");
  const [inputMode, setInputMode] = useState<"phone" | "plate">("phone");
  const [selectedPlateId, setSelectedPlateId] = useState("");
  const [gameLength, setGameLength] = useState<string>("short");
  const [promptSet, setPromptSet] = useState("baby");
  const [deckType, setDeckType] = useState("adventure");
  const [archetypes, setArchetypes] = useState<string[]>(["", "", ""]);

  useEffect(() => {
    Promise.all([
      fetch("/api/games").then((r) => r.json()).catch(() => []),
      fetch("/api/scenarios").then((r) => r.json()).catch(() => []),
      fetch("/api/plates").then((r) => r.json()).catch(() => []),
    ]).then(([g, s, p]) => {
      setGames(Array.isArray(g) ? g : []);
      setScenarios(Array.isArray(s) ? s : []);
      setPlates(Array.isArray(p) ? p : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setPlayerNames((prev) => {
      const next = Array.from({ length: playerCount }, (_, i) => prev[i] ?? "");
      return next;
    });
    setArchetypes((prev) => {
      const next = Array.from({ length: playerCount }, (_, i) => prev[i] ?? "");
      return next;
    });
  }, [playerCount]);

  async function handleCreate() {
    if (!campaignName.trim()) return;
    if (playerNames.some((n) => !n.trim())) return;
    setSubmitting(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName.trim(),
          playerCount,
          playerNames: playerNames.map((n) => n.trim()),
          scenarioId: scenarioId || undefined,
          gameMode: gameLength,
          deckType,
          promptSetCode: promptSet,
          inputMode,
          plateId: inputMode === "plate" && selectedPlateId ? selectedPlateId : undefined,
          archetypes: archetypes.some((a) => a) ? archetypes : undefined,
        }),
      });
      const created = await res.json();
      if (!res.ok) {
        setCreateError(created.error || `Failed to create game (${res.status})`);
        return;
      }
      if (created.id) {
        router.push(`/play?id=${created.id}`);
      } else {
        setCreateError("Game created but no ID returned");
      }
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to create game");
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Game Library</h1>
        <button
          className="btn btn-primary text-base px-6 py-3"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancel" : "+ New Game"}
        </button>
      </div>

      {/* New Game Form */}
      {showForm && (
        <div className="card mb-8">
          <h2 className="text-xl font-semibold mb-5">Start a New Adventure</h2>

          {/* Campaign name */}
          <div className="mb-4">
            <label className="label">Campaign Name</label>
            <input
              className="input"
              placeholder="The Lost Temple of Zara…"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </div>

          {/* Player count */}
          <div className="mb-4">
            <label className="label">Players</label>
            <div className="flex gap-2">
              {PLAYER_COUNTS.map((n) => (
                <button
                  key={n}
                  className={`btn ${playerCount === n ? "btn-primary" : "btn-ghost"} flex-1`}
                  onClick={() => setPlayerCount(n)}
                >
                  {n} Players
                </button>
              ))}
            </div>
          </div>

          {/* Player names */}
          <div className="mb-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${playerCount}, 1fr)` }}>
            {playerNames.map((name, i) => (
              <div key={i}>
                <label className="label">Player {i + 1}</label>
                <input
                  className="input"
                  placeholder={`Player ${i + 1}`}
                  value={name}
                  onChange={(e) => {
                    const copy = [...playerNames];
                    copy[i] = e.target.value;
                    setPlayerNames(copy);
                  }}
                />
              </div>
            ))}
          </div>

          {/* Scenario picker */}
          <div className="mb-4">
            <label className="label">Scenario</label>
            <select
              className="input"
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
            >
              <option value="">Freeform (AI-generated)</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Input mode */}
          <div className="mb-5">
            <label className="label">Input Mode</label>
            <div className="flex gap-2">
              {(["phone", "plate"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`btn flex-1 ${inputMode === mode ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setInputMode(mode)}
                >
                  {mode === "phone" ? "Phone" : "Plate"}
                </button>
              ))}
            </div>

            {/* Plate selector — shown when Plate mode is active */}
            {inputMode === "plate" && (
              <div className="mt-3">
                {plates.length > 0 ? (
                  <select
                    className="input"
                    value={selectedPlateId}
                    onChange={(e) => setSelectedPlateId(e.target.value)}
                  >
                    <option value="">Select a plate...</option>
                    {plates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.id}
                        {p.active_game_id ? " (in use)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm mt-2" style={{ color: "var(--warning)" }}>
                    No plates registered. Go to{" "}
                    <a href="/hardware" className="underline" style={{ color: "var(--accent)" }}>
                      Hardware Management
                    </a>{" "}
                    to add one.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Advanced options */}
          <button
            className="text-sm font-medium mb-4 flex items-center gap-1"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span
              className="inline-block transition-transform"
              style={{ transform: showAdvanced ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
            Advanced Options
          </button>

          {showAdvanced && (
            <div className="rounded-lg p-4 mb-5" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
              {/* Game length */}
              <div className="mb-4">
                <label className="label">Game Length</label>
                <div className="flex gap-2">
                  {GAME_LENGTHS.map((gl) => (
                    <button
                      key={gl}
                      className={`btn flex-1 capitalize ${gameLength === gl ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setGameLength(gl)}
                    >
                      {gl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt set */}
              <div className="mb-4">
                <label className="label">Prompt Set</label>
                <div className="flex gap-2">
                  {PROMPT_SETS.map((ps) => (
                    <button
                      key={ps.code}
                      className={`btn flex-1 ${promptSet === ps.code ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setPromptSet(ps.code)}
                    >
                      {ps.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deck type */}
              <div className="mb-4">
                <label className="label">Card Deck</label>
                <div className="flex gap-2 flex-wrap">
                  {DECK_TYPES.map((dt) => (
                    <button
                      key={dt}
                      className={`btn flex-1 capitalize ${deckType === dt ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setDeckType(dt)}
                    >
                      {dt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Archetypes */}
              <div>
                <label className="label">Player Archetypes</label>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${playerCount}, 1fr)` }}>
                  {archetypes.map((arch, i) => (
                    <select
                      key={i}
                      className="input"
                      value={arch}
                      onChange={(e) => {
                        const copy = [...archetypes];
                        copy[i] = e.target.value;
                        setArchetypes(copy);
                      }}
                    >
                      <option value="">None</option>
                      {ARCHETYPES.map((a) => (
                        <option key={a} value={a}>
                          {a.charAt(0).toUpperCase() + a.slice(1)}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {createError && (
            <p className="text-sm mb-3" style={{ color: "var(--danger)" }}>{createError}</p>
          )}

          {/* Submit */}
          <button
            className="btn btn-primary w-full text-base py-3"
            disabled={submitting || !campaignName.trim() || playerNames.some((n) => !n.trim()) || (inputMode === "plate" && !selectedPlateId)}
            onClick={handleCreate}
          >
            {submitting ? "Creating…" : "Start Adventure"}
          </button>
        </div>
      )}

      {/* Games list */}
      {loading ? (
        <div className="text-center py-16" style={{ color: "var(--text-secondary)" }}>
          Loading games…
        </div>
      ) : games.length === 0 && !showForm ? (
        <div className="text-center py-16">
          <p className="text-lg mb-2" style={{ color: "var(--text-secondary)" }}>
            No games yet
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Create your first adventure to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {games.map((g) => (
            <button
              key={g.id}
              className="card text-left w-full transition-all hover:border-[var(--accent)] hover:-translate-y-0.5"
              onClick={() => router.push(`/play?id=${g.id}`)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg leading-tight">{g.name}</h3>
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                    {g.playerCount} players · Turn {g.turnCounter}
                    {g.game_mode ? ` · ${g.game_mode}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: g.game_complete
                        ? "rgba(46, 213, 115, 0.15)"
                        : "rgba(108, 92, 231, 0.15)",
                      color: g.game_complete ? "var(--success)" : "var(--accent)",
                    }}
                  >
                    {g.game_complete ? "Complete" : "In Progress"}
                  </span>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {formatDate(g.updatedAt)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
