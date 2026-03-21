"use client";

import { useState, useEffect } from "react";

interface GameSummary {
  id: string;
  name: string;
  turnCounter: number;
  playerCount: number;
}

interface CharacterRecord {
  name: string;
  role?: string;
  personality?: string;
  speaking_style?: string;
  current_state?: string;
  portrait?: string;
  voice_id?: string;
  relationships?: Record<string, string>;
}

interface OpenThread {
  id: string;
  description: string;
  urgency: "low" | "medium" | "high";
}

interface StoryBeat {
  id: string;
  description: string;
  act: number;
  priority: string;
  status: "upcoming" | "active" | "completed" | "skipped";
  trigger?: string;
}

interface ActiveConsequence {
  summary: string;
  type: string;
  domain: string;
  created_turn: number;
  expiry_turn: number;
}

interface MemoryBundle {
  canon: string[];
  characters: Record<string, CharacterRecord>;
  open_threads: OpenThread[];
  story_beats?: StoryBeat[];
  active_consequences?: ActiveConsequence[];
  current_location?: string;
  known_locations?: string[];
  story_summary?: string;
}

interface GameData {
  id: string;
  name: string;
  memoryBundle: MemoryBundle;
}

export default function MemoryPage() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGames(data);
      })
      .catch(() => setError("Failed to load games"));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setGameData(null);
      return;
    }
    setLoading(true);
    setError("");
    fetch(`/api/games/${selectedId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setGameData(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const mem = gameData?.memoryBundle;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--accent)" }}>
        Memory Inspector
      </h1>

      <select
        className="input mb-6 max-w-md"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        <option value="">Select a game…</option>
        {games.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} (Turn {g.turnCounter}, {g.playerCount}p)
          </option>
        ))}
      </select>

      {error && (
        <p className="text-sm mb-4" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {loading && (
        <p className="animate-pulse" style={{ color: "var(--text-secondary)" }}>
          Loading memory…
        </p>
      )}

      {mem && !loading && (
        <div className="flex flex-col gap-6">
          {/* Canon Facts */}
          {mem.canon.length > 0 && (
            <section className="card">
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--accent)" }}>
                Canon Facts
              </h2>
              <ul className="list-disc list-inside flex flex-col gap-1.5">
                {mem.canon.map((fact, i) => (
                  <li key={i} className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {fact}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Character Registry */}
          {Object.keys(mem.characters).length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--accent)" }}>
                Character Registry
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(mem.characters).map(([name, char]) => (
                  <div key={name} className="card">
                    <div className="flex items-start gap-3">
                      {char.portrait && (
                        <div
                          className="w-12 h-12 rounded-full bg-cover bg-center flex-shrink-0"
                          style={{
                            backgroundImage: `url(${char.portrait})`,
                            border: "2px solid var(--border)",
                          }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base">{name}</h3>
                        {char.role && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            {char.role}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-1.5 text-sm">
                      {char.personality && <Field label="Personality" value={char.personality} />}
                      {char.speaking_style && <Field label="Voice" value={char.speaking_style} />}
                      {char.current_state && <Field label="State" value={char.current_state} />}
                      {char.voice_id && <Field label="Voice ID" value={char.voice_id} />}
                      {char.relationships && Object.keys(char.relationships).length > 0 && (
                        <div>
                          <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
                            Relationships:{" "}
                          </span>
                          {Object.entries(char.relationships).map(([k, v]) => (
                            <span
                              key={k}
                              className="inline-block text-xs rounded-full px-2 py-0.5 mr-1 mt-1"
                              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
                            >
                              {k}: {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Open Threads */}
          {mem.open_threads.length > 0 && (
            <section className="card">
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--accent)" }}>
                Open Threads
              </h2>
              <div className="flex flex-col gap-2">
                {mem.open_threads.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 text-sm rounded-lg px-3 py-2"
                    style={{ background: "var(--bg-primary)" }}
                  >
                    <UrgencyBadge urgency={t.urgency} />
                    <span className="flex-1">{t.description}</span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {t.id}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Story Beats */}
          {mem.story_beats && mem.story_beats.length > 0 && (
            <section className="card">
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--accent)" }}>
                Story Beats
              </h2>
              <div className="flex flex-col gap-2">
                {mem.story_beats.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 text-sm rounded-lg px-3 py-2"
                    style={{ background: "var(--bg-primary)" }}
                  >
                    <BeatBadge status={b.status} />
                    <span className="flex-1">{b.description}</span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Act {b.act} · {b.priority}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Active Consequences */}
          {mem.active_consequences && mem.active_consequences.length > 0 && (
            <section className="card">
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--accent)" }}>
                Active Consequences
              </h2>
              <div className="flex flex-col gap-2">
                {mem.active_consequences.map((ac, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 text-sm rounded-lg px-3 py-2"
                    style={{ background: "var(--bg-primary)" }}
                  >
                    <span
                      className="inline-block text-xs font-semibold rounded px-2 py-0.5 flex-shrink-0 mt-0.5"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                    >
                      {ac.domain}
                    </span>
                    <div className="flex-1">
                      <p>{ac.summary}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                        {ac.type} · Turn {ac.created_turn}→{ac.expiry_turn}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Location */}
          {(mem.current_location || (mem.known_locations && mem.known_locations.length > 0)) && (
            <section className="card">
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--accent)" }}>
                Location
              </h2>
              {mem.current_location && (
                <div
                  className="inline-block rounded-lg px-4 py-2 mb-3 font-medium"
                  style={{ background: "rgba(108, 92, 231, 0.15)", border: "1px solid var(--accent)" }}
                >
                  {mem.current_location}
                </div>
              )}
              {mem.known_locations && mem.known_locations.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {mem.known_locations.map((loc) => (
                    <span
                      key={loc}
                      className="text-xs rounded-full px-3 py-1"
                      style={{
                        background:
                          loc === mem.current_location
                            ? "rgba(108, 92, 231, 0.15)"
                            : "var(--bg-primary)",
                        border: `1px solid ${loc === mem.current_location ? "var(--accent)" : "var(--border)"}`,
                        color:
                          loc === mem.current_location
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                      }}
                    >
                      {loc}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Story Summary */}
          {mem.story_summary && (
            <section className="card">
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--accent)" }}>
                Story Summary
              </h2>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {mem.story_summary}
              </p>
            </section>
          )}
        </div>
      )}

      {!selectedId && !loading && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Select a game to inspect its AI memory state.
        </p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}:{" "}
      </span>
      {value}
    </p>
  );
}

function UrgencyBadge({ urgency }: { urgency: "low" | "medium" | "high" }) {
  const styles: Record<string, { bg: string; color: string }> = {
    low: { bg: "rgba(136,136,170,0.2)", color: "var(--text-secondary)" },
    medium: { bg: "rgba(245,158,11,0.2)", color: "var(--warning)" },
    high: { bg: "rgba(233,69,96,0.2)", color: "var(--danger)" },
  };
  const s = styles[urgency];
  return (
    <span
      className="text-xs font-bold uppercase rounded px-2 py-0.5 flex-shrink-0"
      style={{ background: s.bg, color: s.color }}
    >
      {urgency}
    </span>
  );
}

function BeatBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    upcoming: { bg: "rgba(136,136,170,0.2)", color: "var(--text-secondary)" },
    active: { bg: "rgba(108,92,231,0.2)", color: "var(--accent)" },
    completed: { bg: "rgba(46,213,115,0.2)", color: "var(--success)" },
    skipped: { bg: "rgba(233,69,96,0.2)", color: "var(--danger)" },
  };
  const s = styles[status] ?? styles.upcoming;
  return (
    <span
      className="text-xs font-bold uppercase rounded px-2 py-0.5 flex-shrink-0"
      style={{ background: s.bg, color: s.color }}
    >
      {status}
    </span>
  );
}
