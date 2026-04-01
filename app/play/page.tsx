"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import type { GameState, GMResponse, CharacterRecord } from "@/lib/types";
import {
  TTSPlayer,
  parseNarrationToSegments,
  type SpeechSegment,
  type TTSConfig,
} from "@/lib/tts-service";
import { loadTTSConfig, saveTTSConfig } from "@/lib/tts-config";

type PipelineState = "Idle" | "Generating..." | "Playing" | "Paused";

function buildCharacterVoices(
  chars: Record<string, CharacterRecord>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [name, c] of Object.entries(chars)) {
    if (c.voice_id) map[name] = c.voice_id;
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Main Play Page (wrapped in Suspense for useSearchParams)          */
/* ------------------------------------------------------------------ */

function PlayPageInner() {
  const params = useSearchParams();
  const gameId = params.get("id");

  /* ---- core state ---- */
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  /* ---- narration display ---- */
  const [displayResponse, setDisplayResponse] = useState<GMResponse | null>(null);
  const [segments, setSegments] = useState<SpeechSegment[]>([]);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState<number | null>(null);

  /* ---- TTS ---- */
  const ttsRef = useRef<TTSPlayer | null>(null);
  const [pipelineState, setPipelineState] = useState<PipelineState>("Idle");

  /* ---- sidebar ---- */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyTurn, setHistoryTurn] = useState<number | null>(null);

  /* ---- TTS config (live state) ---- */
  const [ttsConfig, setTtsConfig] = useState<TTSConfig | null>(null);

  useEffect(() => {
    setTtsConfig(loadTTSConfig());
  }, []);

  const toggleAutoPlay = () => {
    if (!ttsConfig) return;
    const updated = { ...ttsConfig, autoPlay: !ttsConfig.autoPlay };
    saveTTSConfig(updated);
    setTtsConfig(updated);
  };

  const ttsReady = !!(ttsConfig?.narratorVoiceId);

  /* ---- party mode ---- */
  const isPartyMode = game?.input_mode === "party";
  const partyInputType = game?.party_input_type ?? "free-text";
  const partyTimerDuration = game?.party_timer_seconds ?? 30;
  const [partyText, setPartyText] = useState("");
  const [partyTimerActive, setPartyTimerActive] = useState(false);
  const [partyTimeLeft, setPartyTimeLeft] = useState(0);
  const [partyListening, setPartyListening] = useState(false);
  const partyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const gongRef = useRef<AudioContext | null>(null);

  // Party timer countdown
  useEffect(() => {
    if (!partyTimerActive || partyTimeLeft <= 0) return;
    partyTimerRef.current = setInterval(() => {
      setPartyTimeLeft((t) => {
        if (t <= 1) {
          setPartyTimerActive(false);
          // Play gong sound
          try {
            const ctx = gongRef.current || new AudioContext();
            gongRef.current = ctx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 1.5);
            gain.gain.setValueAtTime(0.6, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 2);
          } catch { /* audio not supported */ }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (partyTimerRef.current) clearInterval(partyTimerRef.current); };
  }, [partyTimerActive, partyTimeLeft]);

  const startPartyTimer = () => {
    setPartyText("");
    setPartyTimeLeft(partyTimerDuration);
    setPartyTimerActive(true);
    if (partyInputType === "speech") startListening();
  };

  const startListening = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    const SpeechRecognitionCtor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) { setPartyText("Speech recognition not supported in this browser."); return; }
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + " ";
        else interim += event.results[i][0].transcript;
      }
      setPartyText(finalTranscript + interim);
    };
    recognition.onerror = () => setPartyListening(false);
    recognition.onend = () => setPartyListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setPartyListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setPartyListening(false);
  };

  // Submit party text as a player move
  const handlePartySubmit = async () => {
    if (!gameId || !partyText.trim()) return;
    stopListening();
    setPartyTimerActive(false);
    try {
      await fetch("/api/player/submit-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          playerIndex: 0,
          cardId: `party-text-${Date.now()}`,
          cardText: partyText.trim(),
        }),
      });
      await fetchGame();
    } catch (e) {
      console.error("Party submit failed:", e);
    }
  };

  /* ---- debug panel ---- */
  const [showDebug, setShowDebug] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [debugData, setDebugData] = useState<Record<number, any>>({});

  /* ---- refs ---- */
  const narrationEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ================================================================ */
  /*  Fetch game                                                      */
  /* ================================================================ */

  const hasShownHistory = useRef(false);

  const fetchGame = useCallback(async () => {
    if (!gameId) return;
    try {
      const res = await fetch(`/api/games/${gameId}`);
      if (!res.ok) throw new Error(`Failed to load game (${res.status})`);
      const data: GameState = await res.json();
      setGame(data);
      setError(null);

      if (!hasShownHistory.current && data.history && data.history.length > 0) {
        const latest = data.history[data.history.length - 1];
        showResponse(latest);
        hasShownHistory.current = true;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  /* ================================================================ */
  /*  Poll every 2s                                                   */
  /* ================================================================ */

  useEffect(() => {
    fetchGame();
    pollRef.current = setInterval(fetchGame, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchGame]);

  /* ================================================================ */
  /*  Auto-generate intro + first round for new games                 */
  /* ================================================================ */

  const autoGenStarted = useRef(false);

  useEffect(() => {
    if (!game || !gameId || autoGenStarted.current || generating) return;
    if (game.turnCounter === 0 && (!game.history || game.history.length === 0)) {
      autoGenStarted.current = true;
      (async () => {
        setGenerating(true);
        try {
          // Generate intro (turn 0)
          const introRes = await fetch("/api/gm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameId }),
          });
          if (!introRes.ok) {
            const b = await introRes.json().catch(() => ({}));
            throw new Error(b.error || `Intro generation failed (${introRes.status})`);
          }
          const introRaw = await introRes.json();
          const introDebug = introRaw._debug;
          delete introRaw._debug;
          const introResp: GMResponse = introRaw;
          showResponse(introResp);
          if (introDebug) setDebugData((prev) => ({ ...prev, [introResp.turn]: introDebug }));
          hasShownHistory.current = true;
          await fetchGame();

          // Generate first round (turn 1) — no cards needed for the opener
          const round1Res = await fetch("/api/gm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameId }),
          });
          if (round1Res.ok) {
            const round1Raw = await round1Res.json();
            const round1Debug = round1Raw._debug;
            delete round1Raw._debug;
            const round1Resp: GMResponse = round1Raw;
            showResponse(round1Resp);
            if (round1Debug) setDebugData((prev) => ({ ...prev, [round1Resp.turn]: round1Debug }));
            hasShownHistory.current = true;
            await fetchGame();
          }
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Auto-generation failed");
        } finally {
          setGenerating(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, gameId]);

  /* ================================================================ */
  /*  TTS player setup                                                */
  /* ================================================================ */

  useEffect(() => {
    const player = new TTSPlayer();
    player.onSegmentStart = (i) => {
      setActiveSegmentIdx(i);
      setPipelineState(player.getState() === "generating" ? "Generating..." : "Playing");
    };
    player.onSegmentEnd = (i) => {
      setActiveSegmentIdx((cur) => (cur === i ? null : cur));
    };
    player.onComplete = () => {
      setActiveSegmentIdx(null);
      setPipelineState("Idle");
    };
    ttsRef.current = player;

    return () => {
      player.stop();
    };
  }, []);

  /* ---- sync pipeline state with player ---- */
  useEffect(() => {
    const id = setInterval(() => {
      const player = ttsRef.current;
      if (!player) return;
      const s = player.getState();
      const map: Record<string, PipelineState> = {
        idle: "Idle",
        generating: "Generating...",
        playing: "Playing",
        paused: "Paused",
      };
      setPipelineState(map[s] ?? "Idle");
    }, 250);
    return () => clearInterval(id);
  }, []);

  /* ---- auto-scroll ONLY during TTS playback ---- */
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeSegmentIdx != null && pipelineState === "Playing") {
      narrationEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeSegmentIdx, pipelineState]);

  /* ================================================================ */
  /*  Show a GM response (narration + segments)                       */
  /* ================================================================ */

  const showResponse = useCallback((resp: GMResponse) => {
    setDisplayResponse(resp);
    const segs = parseNarrationToSegments(resp.narration, resp.dialogue);
    setSegments(segs);
    setActiveSegmentIdx(null);
  }, []);

  /* ================================================================ */
  /*  TTS controls                                                    */
  /* ================================================================ */

  const playTTS = useCallback(() => {
    if (!displayResponse || !ttsRef.current) return;
    const config = loadTTSConfig();
    const voices = game?.memoryBundle?.characters
      ? buildCharacterVoices(game.memoryBundle.characters)
      : undefined;
    ttsRef.current.loadAndPlay(
      displayResponse.narration,
      displayResponse.dialogue ?? [],
      config,
      voices
    );
  }, [displayResponse, game]);

  const playTurnTTS = useCallback((turn: GMResponse) => {
    if (!ttsRef.current) return;
    const config = loadTTSConfig();
    if (!config.narratorVoiceId) return;
    const voices = game?.memoryBundle?.characters
      ? buildCharacterVoices(game.memoryBundle.characters)
      : undefined;
    ttsRef.current.loadAndPlay(
      turn.narration,
      turn.dialogue ?? [],
      config,
      voices
    );
  }, [game]);

  const pauseTTS = () => ttsRef.current?.pause();
  const resumeTTS = () => ttsRef.current?.resume();
  const stopTTS = () => {
    ttsRef.current?.stop();
    setActiveSegmentIdx(null);
    setPipelineState("Idle");
  };

  /* ================================================================ */
  /*  Generate turn                                                   */
  /* ================================================================ */

  const allSubmitted =
    game?.players.every((p) => p.pendingCard != null) ?? false;

  const isAutoTurn = (game?.turnCounter ?? 0) <= 1;
  const partyReady = isPartyMode && game?.players[0]?.pendingCard != null;
  const canGenerate = isAutoTurn || allSubmitted || partyReady;

  const handleGenerate = async () => {
    if (!gameId || generating) return;
    if (!canGenerate) {
      setError("Waiting for all players to submit cards.");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/gm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `GM error (${res.status})`);
      }
      const raw = await res.json();
      const debug = raw._debug;
      delete raw._debug;
      const resp: GMResponse = raw;
      showResponse(resp);
      if (debug) {
        setDebugData((prev) => ({ ...prev, [resp.turn]: debug }));
      }
      await fetchGame();

      const config = loadTTSConfig();
      if (config.autoPlay && config.narratorVoiceId) {
        try {
          const voices = game?.memoryBundle?.characters
            ? buildCharacterVoices(game.memoryBundle.characters)
            : undefined;
          ttsRef.current?.loadAndPlay(
            resp.narration,
            resp.dialogue ?? [],
            config,
            voices
          );
        } catch (ttsErr) {
          console.warn("[TTS] Auto-play failed:", ttsErr);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  /* ================================================================ */
  /*  Regenerate last turn                                            */
  /* ================================================================ */

  const handleRegenerate = async () => {
    if (!gameId || !game || generating) return;
    if (!game.history || game.history.length === 0) return;

    setError(null);
    setGenerating(true);
    try {
      // Rewind: remove last history entry and decrement turn
      const rewound = { ...game };
      rewound.history = [...(game.history ?? [])];
      rewound.history.pop();
      rewound.turnCounter = Math.max(0, game.turnCounter - 1);
      rewound.scene_title = rewound.history.length > 0
        ? rewound.history[rewound.history.length - 1].scene_title
        : undefined;

      // Save rewound state
      await fetch(`/api/games/${gameId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rewound),
      });

      // Generate fresh
      const res = await fetch("/api/gm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Regeneration failed (${res.status})`);
      }
      const raw = await res.json();
      const debug = raw._debug;
      delete raw._debug;
      const resp: GMResponse = raw;
      showResponse(resp);
      if (debug) setDebugData((prev) => ({ ...prev, [resp.turn]: debug }));
      await fetchGame();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setGenerating(false);
    }
  };

  /* ================================================================ */
  /*  Replay request handler                                          */
  /* ================================================================ */

  const handleReplay = () => {
    if (!displayResponse) return;
    const config = loadTTSConfig();
    const voices = game?.memoryBundle?.characters
      ? buildCharacterVoices(game.memoryBundle.characters)
      : undefined;
    ttsRef.current?.replay(config, voices);
  };

  /* ================================================================ */
  /*  Reset game (same game, fresh start)                             */
  /* ================================================================ */

  const handleResetGame = async () => {
    if (!gameId || !game) return;
    if (!confirm("Reset this game? All history will be wiped and it starts over from Turn 0.")) return;

    setGenerating(true);
    setError(null);
    try {
      const reset: Partial<GameState> = {
        turnCounter: 0,
        history: [],
        previous_response_id: null,
        scene_title: undefined,
        game_complete: false,
        lastPlayerMoves: undefined,
        memoryBundle: {
          canon: [],
          beats: [],
          open_threads: [],
          characters: {},
          active_consequences: [],
          known_locations: game.memoryBundle.known_locations ?? [],
          story_beats: game.memoryBundle.story_beats,
          current_location: game.memoryBundle.known_locations?.[0],
        },
      };

      // Clear pending cards on all players
      const updatedPlayers = game.players.map((p) => ({
        ...p,
        pendingCard: undefined,
      }));
      (reset as Record<string, unknown>).players = updatedPlayers;

      await fetch(`/api/games/${gameId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset),
      });

      // Reset local state
      setDisplayResponse(null);
      setSegments([]);
      setDebugData({});
      setHistoryTurn(null);
      autoGenStarted.current = false;
      hasShownHistory.current = false;

      await fetchGame();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setGenerating(false);
    }
  };

  /* ================================================================ */
  /*  Debug: auto-generate N rounds with random cards                 */
  /* ================================================================ */

  const [debugRounds, setDebugRounds] = useState<number>(3);
  const [debugRunning, setDebugRunning] = useState(false);
  const [debugProgress, setDebugProgress] = useState<string>("");
  const [debugCardLog, setDebugCardLog] = useState<string[]>([]);

  const handleDebugAutoRun = async () => {
    if (!gameId || !game || debugRunning || generating) return;

    setDebugRunning(true);
    setError(null);
    setDebugCardLog([]);

    // Track last picked card per player to avoid repeats
    const lastPicked: Record<number, string> = {};

    try {
      for (let round = 0; round < debugRounds; round++) {
        const gameRes = await fetch(`/api/games/${gameId}`);
        if (!gameRes.ok) throw new Error("Failed to fetch game");
        const currentGame: GameState = await gameRes.json();

        const turnNum = currentGame.turnCounter;
        setDebugProgress(`Round ${round + 1}/${debugRounds} (Turn ${turnNum})...`);

        // For turns > 1, pick random cards and submit them
        if (turnNum > 1) {
          const picks: string[] = [];
          for (const player of currentGame.players) {
            if (player.hand && player.hand.length > 0 && !player.pendingCard) {
              // Pick a different card than last round
              const available = player.hand.filter((c) => c.id !== lastPicked[player.index]);
              const pool = available.length > 0 ? available : player.hand;
              const randomCard = pool[Math.floor(Math.random() * pool.length)];
              lastPicked[player.index] = randomCard.id;
              picks.push(`${player.name}: "${randomCard.text}"`);
              await fetch("/api/player/submit-card", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  gameId,
                  playerIndex: player.index,
                  cardId: randomCard.id,
                  cardText: randomCard.text,
                }),
              });
            }
          }
          if (picks.length > 0) {
            setDebugCardLog((prev) => [...prev, `Turn ${turnNum}: ${picks.join(" | ")}`]);
          }
        } else {
          setDebugCardLog((prev) => [...prev, `Turn ${turnNum}: (auto — no cards needed)`]);
        }

        // Generate the turn
        const genRes = await fetch("/api/gm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId }),
        });

        if (!genRes.ok) {
          const body = await genRes.json().catch(() => ({}));
          throw new Error(body.error || `Generation failed at turn ${turnNum}`);
        }

        const raw = await genRes.json();
        const debug = raw._debug;
        delete raw._debug;
        const resp: GMResponse = raw;
        showResponse(resp);
        if (debug) setDebugData((prev) => ({ ...prev, [resp.turn]: debug }));
        hasShownHistory.current = true;
        await fetchGame();

        if (resp.game_complete) {
          setDebugCardLog((prev) => [...prev, "--- Game Complete! ---"]);
          break;
        }
      }

      setDebugProgress("Done!");
      setTimeout(() => setDebugProgress(""), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Debug auto-run failed");
    } finally {
      setDebugRunning(false);
    }
  };

  /* ================================================================ */
  /*  Derived state                                                   */
  /* ================================================================ */

  const isComplete = game?.game_complete || displayResponse?.game_complete;
  const currentTurn = game?.turnCounter ?? 0;
  const sceneTitle = displayResponse?.scene_title ?? game?.scene_title;

  const viewingHistory = historyTurn !== null;
  const historyResponse =
    viewingHistory && game?.history
      ? game.history.find((h) => h.turn === historyTurn) ?? null
      : null;

  const shownResponse = viewingHistory ? historyResponse : displayResponse;
  const shownSegments =
    viewingHistory && historyResponse
      ? parseNarrationToSegments(historyResponse.narration, historyResponse.dialogue)
      : segments;

  /* ================================================================ */
  /*  Loading / error states                                          */
  /* ================================================================ */

  if (!gameId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: "var(--danger)" }}>No game ID provided. Add ?id=YOUR_GAME_ID to the URL.</p>
      </div>
    );
  }

  if (loading && !game) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          <p className="mt-4" style={{ color: "var(--text-secondary)" }}>Loading game...</p>
        </div>
      </div>
    );
  }

  if (error && !game) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="card text-center max-w-md">
          <p style={{ color: "var(--danger)" }} className="mb-4">{error}</p>
          <button className="btn btn-primary" onClick={fetchGame}>Retry</button>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      {/* ---- Sidebar ---- */}
      <aside
        className="flex flex-col border-r overflow-y-auto transition-all duration-300 shrink-0"
        style={{
          width: sidebarOpen ? 320 : 0,
          borderColor: "var(--border)",
          background: "var(--bg-secondary)",
          opacity: sidebarOpen ? 1 : 0,
        }}
      >
        {sidebarOpen && (
          <div className="p-4 space-y-6 min-w-[320px]">
            {/* Join codes */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "var(--text-secondary)" }}>
                Join Codes
              </h3>
              <div className="space-y-2">
                {game?.players.map((p) => (
                  <div key={p.index} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg"
                    style={{ background: "var(--bg-card)" }}>
                    <span>{p.name}</span>
                    <code className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{ background: "var(--bg-primary)", color: "var(--accent)" }}>
                      {p.code ?? "—"}
                    </code>
                  </div>
                ))}
              </div>
            </section>

            {/* Card Hands / Plate Status */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "var(--text-secondary)" }}>
                {game?.input_mode === "plate" ? "Scanned Cards" : "Card Hands"}
              </h3>
              <div className="space-y-3">
                {game?.players.map((p) => (
                  <div key={p.index}>
                    <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                      {p.name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {game?.input_mode === "plate" ? (
                        p.pendingCard ? (
                          <span className="text-xs px-2 py-1 rounded"
                            style={{
                              background: "rgba(108,92,231,0.3)",
                              border: "1px solid var(--accent)",
                            }}>
                            {p.pendingCard.cardText}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Waiting for scan...</span>
                        )
                      ) : (
                        p.hand?.map((card) => (
                          <span key={card.id} className="text-xs px-2 py-1 rounded"
                            style={{
                              background: p.pendingCard?.cardId === card.id
                                ? "rgba(108,92,231,0.3)"
                                : "var(--bg-primary)",
                              border: `1px solid ${p.pendingCard?.cardId === card.id ? "var(--accent)" : "var(--border)"}`,
                            }}>
                            {card.text}
                          </span>
                        )) ?? (
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>No cards</span>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Turn History */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "var(--text-secondary)" }}>
                Turn History
              </h3>
              <div className="space-y-1">
                {game?.history && game.history.length > 0 ? (
                  <>
                    <button
                      className="w-full text-left text-xs px-3 py-2 rounded-lg transition-colors"
                      style={{
                        background: !viewingHistory ? "rgba(108,92,231,0.2)" : "transparent",
                        color: !viewingHistory ? "var(--accent)" : "var(--text-secondary)",
                      }}
                      onClick={() => setHistoryTurn(null)}
                    >
                      Current
                    </button>
                    {[...game.history].reverse().map((h) => (
                      <button
                        key={h.turn}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg transition-colors"
                        style={{
                          background: historyTurn === h.turn ? "rgba(108,92,231,0.2)" : "transparent",
                          color: historyTurn === h.turn ? "var(--accent)" : "var(--text-secondary)",
                        }}
                        onClick={() => {
                          setHistoryTurn(h.turn);
                          showResponse(h);
                        }}
                      >
                        Turn {h.turn}: {h.scene_title || "Untitled"}
                      </button>
                    ))}
                  </>
                ) : (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>No turns yet</p>
                )}
              </div>
            </section>
          </div>
        )}
      </aside>

      {/* ---- Main content ---- */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* ======== Top Bar ======== */}
        <header
          className="flex items-center gap-4 px-5 py-3 border-b shrink-0"
          style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
        >
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}
            onClick={() => setSidebarOpen((o) => !o)}
            title="Toggle sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold truncate">{game?.name ?? "Game"}</h1>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Turn {currentTurn}
              {sceneTitle && <span className="ml-2 opacity-70">— {sceneTitle}</span>}
            </p>
          </div>

          {/* Reset game button */}
          <button
            className="btn btn-ghost text-xs px-3 py-1.5 shrink-0"
            style={{ color: "var(--danger)" }}
            onClick={handleResetGame}
            disabled={generating || debugRunning}
            title="Reset game — wipe all history and restart from Turn 0"
          >
            Reset Game
          </button>

          {/* Player status pills */}
          <div className="flex items-center gap-2 shrink-0">
            {game?.players.map((p) => (
              <div key={p.index} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                style={{ background: "var(--bg-card)" }}>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: p.pendingCard ? "var(--success)" : "var(--text-secondary)",
                    boxShadow: p.pendingCard ? "0 0 6px var(--success)" : "none",
                  }}
                />
                <span className="truncate max-w-[5rem]">{p.name}</span>
              </div>
            ))}
          </div>
        </header>

        {/* ======== Story Area ======== */}
        <main ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-3xl mx-auto">
            {/* Game complete banner */}
            {isComplete && (
              <div className="text-center mb-8 py-6 px-4 rounded-2xl"
                style={{
                  background: "linear-gradient(135deg, rgba(108,92,231,0.15), rgba(192,132,252,0.1))",
                  border: "1px solid rgba(108,92,231,0.3)",
                }}>
                <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--accent)" }}>
                  Game Complete!
                </h2>
                {displayResponse?.game_ending && (
                  <p className="text-sm leading-relaxed max-w-lg mx-auto"
                    style={{ color: "var(--text-secondary)" }}>
                    {displayResponse.game_ending}
                  </p>
                )}
                <a href="/game-library"
                  className="btn btn-ghost inline-block mt-4 text-xs">
                  Back to Library
                </a>
              </div>
            )}

            {/* Replay request banner */}
            {game?.replayRequested && !isComplete && (
              <div className="flex items-center justify-between mb-6 px-4 py-3 rounded-xl"
                style={{
                  background: "rgba(245,158,11,0.1)",
                  border: "1px solid rgba(245,158,11,0.3)",
                }}>
                <span className="text-sm" style={{ color: "var(--warning)" }}>
                  A player requested a replay
                </span>
                <button className="btn text-xs px-3 py-1.5"
                  style={{ background: "var(--warning)", color: "#000" }}
                  onClick={handleReplay}>
                  Replay
                </button>
              </div>
            )}

            {/* Full story — all turns shown in order */}
            {game?.history && game.history.length > 0 ? (
              <div className="space-y-10">
                {game.history.map((turn, turnIdx) => {
                  const isLatest = turnIdx === game.history!.length - 1;
                  const turnSegs = isLatest ? segments
                    : parseNarrationToSegments(turn.narration, turn.dialogue);
                  return (
                    <article key={turn.turn} id={`turn-${turn.turn}`}>
                      {/* Turn header */}
                      <div className="flex items-center gap-3 mb-3">
                        {/* Play from this turn button */}
                        {ttsReady && (
                          <button
                            className="w-6 h-6 flex items-center justify-center rounded-full shrink-0 transition-colors"
                            style={{
                              background: "var(--bg-card)",
                              color: "var(--accent)",
                              border: "1px solid var(--border)",
                            }}
                            onClick={() => playTurnTTS(turn)}
                            title={`Play ${turn.turn === 0 ? "Prologue" : `Turn ${turn.turn}`} aloud`}
                          >
                            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                              <polygon points="0,0 10,6 0,12" />
                            </svg>
                          </button>
                        )}
                        <h2 className="text-xs font-semibold uppercase tracking-widest"
                          style={{ color: "var(--accent)", opacity: 0.8 }}>
                          {turn.turn === 0 ? "Prologue" : `Turn ${turn.turn}`}
                          {turn.scene_title ? ` — ${turn.scene_title}` : ""}
                        </h2>
                        {/* Debug toggle per turn */}
                        {debugData[turn.turn] && (
                          <button className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}
                            onClick={() => setShowDebug((v) => !v)}>
                            {showDebug ? "Hide Debug" : "Debug"}
                          </button>
                        )}
                      </div>

                      {/* Debug panel for this turn */}
                      {showDebug && debugData[turn.turn] && (
                        <div className="mb-4 p-3 rounded-lg text-[11px] font-mono overflow-x-auto"
                          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", maxHeight: 400, overflowY: "auto" }}>
                          <div className="mb-2 font-sans font-semibold text-xs" style={{ color: "var(--accent)" }}>
                            AI Debug — Turn {turn.turn}
                          </div>
                          <div className="mb-2">
                            <span style={{ color: "var(--text-secondary)" }}>System prompt: </span>
                            <span>{debugData[turn.turn].systemInstructionsLength} chars</span>
                          </div>
                          <div className="mb-2">
                            <span style={{ color: "var(--text-secondary)" }}>Turn input: </span>
                            <span>{debugData[turn.turn].turnInputLength} chars</span>
                          </div>
                          <details className="mb-2">
                            <summary className="cursor-pointer" style={{ color: "var(--accent)" }}>System Instructions</summary>
                            <pre className="mt-1 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                              {debugData[turn.turn].systemInstructions}
                            </pre>
                          </details>
                          <details>
                            <summary className="cursor-pointer" style={{ color: "var(--accent)" }}>Turn Input</summary>
                            <pre className="mt-1 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                              {debugData[turn.turn].turnInput}
                            </pre>
                          </details>
                        </div>
                      )}

                      {/* Narration text — split by paragraphs to preserve line breaks */}
                      <div className="text-lg leading-relaxed space-y-4" style={{ lineHeight: 1.9 }}>
                        {turn.narration.split(/\n\n+/).map((para, pi) => {
                          const paraSegs = parseNarrationToSegments(para, turn.dialogue);
                          return (
                            <p key={pi}>
                              {paraSegs.map((seg, i) => (
                                <span
                                  key={i}
                                  style={{
                                    transition: "color 200ms, opacity 200ms",
                                    ...(seg.type === "dialogue"
                                      ? { color: "rgba(192,132,252,0.7)" }
                                      : {}),
                                  }}
                                >
                                  {seg.type === "dialogue" ? `"${seg.text}" ` : `${seg.text} `}
                                </span>
                              ))}
                            </p>
                          );
                        })}
                      </div>

                      {/* Consequences — only show if they have actual text */}
                      {turn.consequences && turn.consequences.filter(c => c.summary?.trim()).length > 0 && (
                        <div className="mt-4 space-y-1.5">
                          {turn.consequences.filter(c => c.summary?.trim()).map((c, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg"
                              style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                              <span className="shrink-0 mt-0.5" style={{
                                color: c.type === "immediate" ? "var(--warning)" : "var(--text-secondary)",
                              }}>
                                {c.type === "immediate" ? "⚡" : "⏳"}
                              </span>
                              <span>{c.summary}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Next prompt — only on latest turn */}
                      {isLatest && turn.next_prompt && !isComplete && (
                        <p className="mt-5 text-sm italic" style={{ color: "var(--text-secondary)" }}>
                          {turn.next_prompt}
                        </p>
                      )}

                      {/* Divider between turns */}
                      {!isLatest && (
                        <div className="mt-8 border-b" style={{ borderColor: "var(--border)", opacity: 0.4 }} />
                      )}
                    </article>
                  );
                })}
              </div>
            ) : generating ? (
              <div className="text-center py-20">
                <div className="inline-block w-8 h-8 border-2 rounded-full animate-spin mb-4"
                  style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
                <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
                  Generating the story...
                </p>
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
                  Waiting for the story to begin...
                </p>
              </div>
            )}
            <div ref={narrationEndRef} />
          </div>
        </main>

        {/* ======== TTS Controls ======== */}
        {shownResponse && (
          <div className="flex items-center justify-center gap-3 px-5 py-2.5 border-t shrink-0"
            style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>

            {ttsReady ? (
              <>
                <button className="btn btn-ghost text-xs px-3 py-1.5" onClick={playTTS} title="Play narration with ElevenLabs TTS">
                  ▶ Play
                </button>
                {pipelineState === "Playing" && (
                  <button className="btn btn-ghost text-xs px-3 py-1.5" onClick={pauseTTS} title="Pause">
                    ⏸ Pause
                  </button>
                )}
                {pipelineState === "Paused" && (
                  <button className="btn btn-ghost text-xs px-3 py-1.5" onClick={resumeTTS} title="Resume">
                    ▶ Resume
                  </button>
                )}
                {pipelineState !== "Idle" && (
                  <button className="btn btn-ghost text-xs px-3 py-1.5" onClick={stopTTS} title="Stop">
                    ◼ Stop
                  </button>
                )}

                {/* Pipeline state indicator */}
                <span className="text-xs" style={{
                  color: pipelineState === "Idle" ? "var(--text-secondary)"
                    : pipelineState === "Playing" ? "var(--success)"
                    : pipelineState === "Paused" ? "var(--warning)"
                    : "var(--accent)",
                }}>
                  {pipelineState}
                </span>

                {/* Divider */}
                <span className="text-xs" style={{ color: "var(--border)" }}>|</span>

                {/* Auto-play toggle */}
                <button
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    background: ttsConfig?.autoPlay ? "rgba(108,92,231,0.2)" : "transparent",
                    color: ttsConfig?.autoPlay ? "var(--accent)" : "var(--text-secondary)",
                    border: `1px solid ${ttsConfig?.autoPlay ? "var(--accent)" : "var(--border)"}`,
                  }}
                  onClick={toggleAutoPlay}
                  title="Auto-play narration after each turn generates"
                >
                  Auto-play {ttsConfig?.autoPlay ? "ON" : "OFF"}
                </button>
              </>
            ) : (
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                No voice configured —
              </span>
            )}

            {/* Settings link */}
            <a
              href="/settings"
              target="_blank"
              className="text-xs px-2 py-1 rounded"
              style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
              title="Open TTS settings to choose a voice"
            >
              TTS Settings
            </a>
          </div>
        )}

        {/* ======== Bottom Turn Controls ======== */}
        {!isComplete && (
          <div className="px-5 py-4 border-t shrink-0"
            style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
            <div className="max-w-3xl mx-auto">
              {/* Party mode controls */}
              {isPartyMode && !isAutoTurn ? (
                <div className="mb-3">
                  {/* Timer display */}
                  {partyTimerActive && (
                    <div className="text-center mb-3">
                      <div className="text-4xl font-bold tabular-nums" style={{
                        color: partyTimeLeft <= 5 ? "var(--danger)" : "var(--accent)",
                        transition: "color 0.3s",
                      }}>
                        {partyTimeLeft}s
                      </div>
                      <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                        {partyInputType === "speech" ? "Yell what you want to do!" : "Type what the party does!"}
                      </p>
                    </div>
                  )}

                  {/* Input area */}
                  {partyInputType !== "cards" && !partyReady && (
                    <div className="space-y-2">
                      {!partyTimerActive && !partyText && (
                        <button
                          className="btn btn-primary w-full py-3 text-sm"
                          onClick={startPartyTimer}
                          disabled={generating}
                        >
                          Start Discussion Timer ({partyTimerDuration}s)
                        </button>
                      )}

                      {(partyTimerActive || partyText) && (
                        <>
                          {partyInputType === "speech" ? (
                            <div className="relative">
                              <div className="input min-h-[80px] text-sm whitespace-pre-wrap"
                                style={{ background: "var(--bg-primary)" }}>
                                {partyText || (partyListening ? "Listening..." : "Press start to speak")}
                              </div>
                              {partyListening && (
                                <span className="absolute top-2 right-2 w-3 h-3 rounded-full animate-pulse"
                                  style={{ background: "var(--danger)" }} />
                              )}
                            </div>
                          ) : (
                            <textarea
                              className="input w-full text-sm"
                              rows={3}
                              placeholder="What does the party do?"
                              value={partyText}
                              onChange={(e) => setPartyText(e.target.value)}
                              autoFocus
                            />
                          )}

                          <div className="flex gap-2">
                            {partyInputType === "speech" && (
                              <button
                                className={`btn ${partyListening ? "btn-danger" : "btn-ghost"} text-sm px-4`}
                                onClick={partyListening ? stopListening : startListening}
                              >
                                {partyListening ? "Stop Mic" : "Start Mic"}
                              </button>
                            )}
                            <button
                              className="btn btn-primary flex-1 py-2 text-sm"
                              disabled={!partyText.trim()}
                              onClick={handlePartySubmit}
                            >
                              Lock In Action
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Party ready status */}
                  {partyReady && (
                    <div className="text-center py-2">
                      <span className="text-xs font-medium px-3 py-1 rounded-full"
                        style={{ background: "rgba(46,213,115,0.15)", color: "var(--success)" }}>
                        Action locked in: &ldquo;{game?.players[0]?.pendingCard?.cardText}&rdquo;
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* Normal player submission status */
                <div className="flex items-center gap-3 mb-3">
                  {game?.players.map((p) => (
                    <div key={p.index} className="flex items-center gap-1.5 text-xs"
                      style={{ color: p.pendingCard ? "var(--success)" : "var(--text-secondary)" }}>
                      <span className="w-1.5 h-1.5 rounded-full"
                        style={{ background: p.pendingCard ? "var(--success)" : "var(--border)" }} />
                      {p.name}: {p.pendingCard ? "Ready" : "Waiting"}
                    </div>
                  ))}
                </div>
              )}

              {/* Generate + Regenerate buttons */}
              <div className="flex gap-2">
                <button
                  className="btn btn-primary flex-1 py-3 text-sm"
                  disabled={generating || (!canGenerate)}
                  onClick={() => { setPartyText(""); handleGenerate(); }}
                >
                  {generating ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 rounded-full animate-spin"
                        style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                      Generating...
                    </span>
                  ) : isAutoTurn ? (
                    "Generate"
                  ) : (allSubmitted || partyReady) ? (
                    "Generate Next Turn"
                  ) : isPartyMode && partyInputType === "cards" ? (
                    "Play a card first"
                  ) : (
                    "Waiting for players..."
                  )}
                </button>

                {game?.history && game.history.length > 0 && (
                  <button
                    className="btn btn-ghost py-3 text-sm px-4"
                    disabled={generating}
                    onClick={handleRegenerate}
                    title="Regenerate the last turn"
                  >
                    ↻ Redo
                  </button>
                )}
              </div>

              {/* Debug toggle */}
              <div className="flex items-center justify-between mt-2">
                {error && (
                  <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>
                )}
                <button
                  className="text-[10px] ml-auto"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => setShowDebug((v) => !v)}
                >
                  {showDebug ? "Hide AI Debug" : "Show AI Debug"}
                </button>
              </div>

              {/* Debug auto-run panel */}
              {showDebug && (
                <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "var(--accent)" }}>
                    Debug: Auto-Generate Rounds
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Rounds:</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={debugRounds}
                      onChange={(e) => setDebugRounds(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                      className="w-16 px-2 py-1 text-xs rounded"
                      style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                      disabled={debugRunning}
                    />
                    <button
                      className="btn text-xs px-3 py-1.5"
                      style={{ background: "var(--accent)", color: "#fff" }}
                      onClick={handleDebugAutoRun}
                      disabled={debugRunning || generating}
                    >
                      {debugRunning ? "Running..." : "Auto-Run"}
                    </button>
                    {debugProgress && (
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {debugProgress}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: "var(--text-secondary)" }}>
                    Picks random cards from each player&apos;s hand per round. Turns 0-1 auto-generate without cards.
                  </p>

                  {/* Card pick log */}
                  {debugCardLog.length > 0 && (
                    <div className="mt-2 p-2 rounded text-[11px] font-mono max-h-40 overflow-y-auto"
                      style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                      <p className="font-sans font-semibold text-xs mb-1" style={{ color: "var(--accent)" }}>
                        Cards Picked:
                      </p>
                      {debugCardLog.map((line, i) => (
                        <div key={i} style={{ color: "var(--text-secondary)" }}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Viewing history notice */}
        {viewingHistory && (
          <div className="flex items-center justify-center gap-3 px-5 py-2 border-t shrink-0"
            style={{ borderColor: "var(--border)", background: "rgba(108,92,231,0.08)" }}>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Viewing Turn {historyTurn}
            </span>
            <button className="text-xs underline" style={{ color: "var(--accent)" }}
              onClick={() => setHistoryTurn(null)}>
              Back to current
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Export with Suspense boundary for useSearchParams                  */
/* ------------------------------------------------------------------ */

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="inline-block w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      }
    >
      <PlayPageInner />
    </Suspense>
  );
}
