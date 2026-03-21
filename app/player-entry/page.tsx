"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function PlayerEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/player/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Invalid code");
      }

      const { gameId, playerIndex, playerName, gameName } = await res.json();
      localStorage.setItem("ttdnd_gameId", gameId);
      localStorage.setItem("ttdnd_playerIndex", String(playerIndex));
      localStorage.setItem("ttdnd_playerName", playerName);
      localStorage.setItem("ttdnd_gameName", gameName);
      router.push("/player-view");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <h1
        style={{
          fontSize: "3rem",
          fontWeight: 800,
          letterSpacing: "0.15em",
          marginBottom: "0.25rem",
        }}
      >
        TTDND
      </h1>
      <p
        style={{
          color: "var(--text-secondary)",
          marginBottom: "2.5rem",
          fontSize: "1.1rem",
        }}
      >
        Enter your game code
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.25rem",
          width: "100%",
          maxWidth: "320px",
        }}
      >
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="0000"
          autoFocus
          style={{
            width: "100%",
            fontSize: "2.5rem",
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: "0.5em",
            padding: "0.75rem 1rem",
            borderRadius: "16px",
            border: "2px solid var(--border)",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            outline: "none",
            caretColor: "var(--accent)",
          }}
        />

        <button
          type="submit"
          disabled={code.length < 4 || loading}
          style={{
            width: "100%",
            padding: "1rem",
            fontSize: "1.25rem",
            fontWeight: 700,
            borderRadius: "16px",
            border: "none",
            background:
              code.length < 4 || loading
                ? "var(--border)"
                : "var(--accent)",
            color: "var(--text-primary)",
            cursor: code.length < 4 || loading ? "not-allowed" : "pointer",
            transition: "background 150ms",
          }}
        >
          {loading ? "Joining..." : "Join"}
        </button>
      </form>

      {error && (
        <p
          style={{
            marginTop: "1.5rem",
            color: "var(--danger)",
            fontSize: "1rem",
            textAlign: "center",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
