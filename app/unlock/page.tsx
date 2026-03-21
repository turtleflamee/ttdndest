"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UnlockPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        setError("Invalid code. Try again.");
        setLoading(false);
        return;
      }

      router.push("/game-library");
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <form
        onSubmit={handleSubmit}
        className="card w-full max-w-sm flex flex-col items-center gap-5 py-8 px-6"
        suppressHydrationWarning
      >
        <h1 className="text-2xl font-bold tracking-wide" style={{ color: "var(--accent)" }}>
          TTDND
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Enter admin code to continue
        </p>

        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Admin code"
          className="input text-center"
        />

        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={loading || !code} suppressHydrationWarning>
          {loading ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
