"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { GameState, TextCard } from "@/lib/types";

export default function PlayerViewPage() {
  const router = useRouter();
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const lastTurn = useRef(0);

  const gameId =
    typeof window !== "undefined"
      ? localStorage.getItem("ttdnd_gameId")
      : null;
  const playerIndex =
    typeof window !== "undefined"
      ? Number(localStorage.getItem("ttdnd_playerIndex"))
      : 0;
  const playerName =
    typeof window !== "undefined"
      ? localStorage.getItem("ttdnd_playerName") ?? ""
      : "";
  const gameName =
    typeof window !== "undefined"
      ? localStorage.getItem("ttdnd_gameName") ?? ""
      : "";

  const poll = useCallback(async () => {
    if (!gameId) return;
    try {
      const res = await fetch(`/api/games/${gameId}`);
      if (!res.ok) return;
      const data: GameState = await res.json();
      setGame(data);

      const player = data.players[playerIndex];
      if (!player) return;

      if (player.pendingCard) {
        setSubmitted(true);
      }

      if (data.turnCounter > lastTurn.current && !player.pendingCard) {
        setSubmitted(false);
        setSelectedCardId(null);
      }

      lastTurn.current = data.turnCounter;
    } catch {
      // polling failure; silently retry
    }
  }, [gameId, playerIndex]);

  useEffect(() => {
    if (!gameId) {
      router.replace("/player-entry");
      return;
    }
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [gameId, poll, router]);

  const hand: TextCard[] = game?.players[playerIndex]?.hand ?? [];

  async function handleSubmit() {
    if (!selectedCardId || !gameId) return;
    const card = hand.find((c) => c.id === selectedCardId);
    if (!card) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/player/submit-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          playerIndex,
          cardId: card.id,
          cardText: card.text,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Submit failed");
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReplay() {
    if (!gameId) return;
    try {
      await fetch("/api/player/request-replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
    } catch {
      // best-effort
    }
  }

  if (!game) {
    return (
      <div style={styles.container}>
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  const submittedCard = game.players[playerIndex]?.pendingCard;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>
          {playerName}
        </span>
        <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          {gameName}
        </span>
      </header>

      {submitted ? (
        <div style={styles.submittedWrap}>
          {submittedCard && (
            <div
              className="player-card submitted"
              style={{ marginBottom: "1rem", maxWidth: "320px" }}
            >
              {submittedCard.cardText}
            </div>
          )}
          <p
            style={{
              color: "var(--success)",
              fontWeight: 700,
              fontSize: "1.2rem",
            }}
          >
            Submitted!
          </p>
          <p
            style={{
              color: "var(--text-secondary)",
              marginTop: "0.5rem",
              fontSize: "0.95rem",
            }}
          >
            Waiting for other players...
          </p>
        </div>
      ) : (
        <>
          <div style={styles.cardGrid}>
            {hand.map((card) => (
              <button
                key={card.id}
                className={`player-card${selectedCardId === card.id ? " selected" : ""}`}
                onClick={() => setSelectedCardId(card.id)}
                style={{ width: "100%" }}
              >
                {card.text}
              </button>
            ))}
          </div>

          {error && (
            <p style={{ color: "var(--danger)", textAlign: "center" }}>
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!selectedCardId || submitting}
            style={{
              ...styles.submitBtn,
              background:
                !selectedCardId || submitting
                  ? "var(--border)"
                  : "var(--accent)",
              cursor:
                !selectedCardId || submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </>
      )}

      <button onClick={handleReplay} style={styles.replayBtn}>
        Replay Narration
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "1rem 1rem 2rem",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    maxWidth: "400px",
    marginBottom: "1rem",
    padding: "0.5rem 0",
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
    width: "100%",
    maxWidth: "400px",
    flex: 1,
    alignContent: "start",
  },
  submittedWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: "400px",
    textAlign: "center",
  },
  submitBtn: {
    width: "100%",
    maxWidth: "400px",
    padding: "1rem",
    marginTop: "1rem",
    fontSize: "1.2rem",
    fontWeight: 700,
    borderRadius: "16px",
    border: "none",
    color: "var(--text-primary)",
    transition: "background 150ms",
  },
  replayBtn: {
    marginTop: "1rem",
    padding: "0.6rem 1.5rem",
    fontSize: "0.9rem",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
};
