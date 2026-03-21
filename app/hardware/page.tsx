"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface PhysicalCard {
  id: string;
  card_number: number;
  text: string;
  prompt_hint?: string;
}

interface Plate {
  id: string;
  name: string;
  api_token: string;
  active_game_id?: string;
  reader_count?: number;
  created_at: string;
}

type Tab = "cards" | "plates";

export default function HardwarePage() {
  const [tab, setTab] = useState<Tab>("cards");

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--accent)" }}>
        Hardware Management
      </h1>

      <div className="flex gap-1 mb-6">
        {(["cards", "plates"] as Tab[]).map((t) => (
          <button
            key={t}
            className="btn"
            style={{
              background: tab === t ? "var(--accent)" : "transparent",
              color: tab === t ? "white" : "var(--text-secondary)",
              border: tab === t ? "none" : "1px solid var(--border)",
            }}
            onClick={() => setTab(t)}
          >
            {t === "cards" ? "Physical Cards" : "Plates"}
          </button>
        ))}
      </div>

      {tab === "cards" ? <PhysicalCardsTab /> : <PlatesTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Physical Cards Tab
   ═══════════════════════════════════════════════════════════ */

function PhysicalCardsTab() {
  const [cards, setCards] = useState<PhysicalCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingCard, setEditingCard] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [scanActive, setScanActive] = useState(false);
  const [scanPlateId, setScanPlateId] = useState("");
  const [scanReader, setScanReader] = useState<number | null>(null); // null = all readers
  const [scanResult, setScanResult] = useState<Record<string, unknown> | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch("/api/physical-cards");
      const data = await res.json();
      if (Array.isArray(data)) setCards(data);
    } catch {
      setError("Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  async function saveCardText(cardNumber: number, text: string) {
    setSaving(true);
    try {
      await fetch("/api/physical-cards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_number: cardNumber, text }),
      });
      setCards((prev) =>
        prev.map((c) => (c.card_number === cardNumber ? { ...c, text } : c))
      );
      setEditingCard(null);
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkImport() {
    const lines = bulkText.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return;

    setSaving(true);
    try {
      for (let i = 0; i < lines.length && i < 50; i++) {
        await fetch("/api/physical-cards", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card_number: i + 1, text: lines[i].trim() }),
        });
      }
      await fetchCards();
      setBulkText("");
      setBulkOpen(false);
    } catch {
      setError("Bulk import failed");
    } finally {
      setSaving(false);
    }
  }

  // Store raw poll data separately so reader filter is client-side only
  const [rawScanResult, setRawScanResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (scanActive && scanPlateId) {
      scanIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/hardware/test-scan?plateId=${encodeURIComponent(scanPlateId)}`
          );
          const data = await res.json();
          setRawScanResult(data);
        } catch {
          /* ignore polling errors */
        }
      }, 1500);
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [scanActive, scanPlateId]);

  // Apply reader filter client-side (no restart needed when switching readers)
  useEffect(() => {
    if (!rawScanResult) { setScanResult(null); return; }
    if (scanReader === null) { setScanResult(rawScanResult); return; }

    // Filter history to selected reader
    const history = Array.isArray(rawScanResult.history) ? rawScanResult.history as Record<string, unknown>[] : [];
    const filtered = history.filter((e) => e.readerIndex === scanReader);
    if (filtered.length === 0) { setScanResult(null); return; }

    setScanResult({ ...filtered[0], history: filtered });
  }, [rawScanResult, scanReader]);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {/* Bulk Import */}
      <div className="card">
        <button
          className="btn btn-ghost text-sm"
          onClick={() => setBulkOpen(!bulkOpen)}
        >
          {bulkOpen ? "Close Bulk Import" : "Bulk Import Cards"}
        </button>
        {bulkOpen && (
          <div className="mt-4">
            <textarea
              className="textarea"
              rows={10}
              placeholder="Paste all 50 card texts, one per line…"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                className="btn btn-primary"
                disabled={saving || !bulkText.trim()}
                onClick={handleBulkImport}
              >
                {saving ? "Importing…" : "Save All"}
              </button>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {bulkText.split("\n").filter((l) => l.trim()).length} / 50 lines
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Card Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <p className="animate-pulse" style={{ color: "var(--text-secondary)" }}>
            Loading cards…
          </p>
        ) : (
          <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ color: "var(--text-secondary)" }}>
                <th className="text-left py-2 px-3 font-semibold w-16">#</th>
                <th className="text-left py-2 px-3 font-semibold">Text</th>
                <th className="text-left py-2 px-3 font-semibold w-48">Prompt Hint</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr
                  key={card.card_number}
                  className="border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="py-2 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>
                    {card.card_number}
                  </td>
                  <td className="py-2 px-3">
                    {editingCard === card.card_number ? (
                      <div className="flex gap-2">
                        <input
                          className="input flex-1"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveCardText(card.card_number, editText);
                            if (e.key === "Escape") setEditingCard(null);
                          }}
                        />
                        <button
                          className="btn btn-primary"
                          disabled={saving}
                          onClick={() => saveCardText(card.card_number, editText)}
                        >
                          Save
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditingCard(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span
                        className="cursor-pointer hover:underline"
                        onClick={() => {
                          setEditingCard(card.card_number);
                          setEditText(card.text);
                        }}
                      >
                        {card.text || (
                          <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
                            Click to set text
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {card.prompt_hint || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Test Scan */}
      <div className="card">
        <h3 className="font-semibold mb-3" style={{ color: "var(--accent)" }}>
          Test Scan
        </h3>
        <div className="flex items-center gap-3 mb-3">
          <input
            className="input max-w-xs"
            placeholder="Plate ID"
            value={scanPlateId}
            onChange={(e) => setScanPlateId(e.target.value)}
          />
          <button
            className={`btn ${scanActive ? "btn-danger" : "btn-primary"}`}
            disabled={!scanPlateId}
            onClick={() => {
              setScanActive(!scanActive);
              if (scanActive) setScanResult(null);
            }}
          >
            {scanActive ? "Stop Polling" : "Start Polling"}
          </button>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Reader:</span>
          <button
            className="btn btn-sm"
            style={{
              background: scanReader === null ? "var(--accent)" : "transparent",
              color: scanReader === null ? "white" : "var(--text-secondary)",
              border: scanReader === null ? "none" : "1px solid var(--border)",
              padding: "2px 10px",
              fontSize: "0.75rem",
            }}
            onClick={() => setScanReader(null)}
          >
            All
          </button>
          {[1, 2, 3, 4].map((r) => (
            <button
              key={r}
              className="btn btn-sm"
              style={{
                background: scanReader === r ? "var(--accent)" : "transparent",
                color: scanReader === r ? "white" : "var(--text-secondary)",
                border: scanReader === r ? "none" : "1px solid var(--border)",
                padding: "2px 10px",
                fontSize: "0.75rem",
              }}
              onClick={() => setScanReader(r)}
            >
              {r}
            </button>
          ))}
        </div>
        {scanActive && (
          <p className="text-xs mb-2 animate-pulse" style={{ color: "var(--text-secondary)" }}>
            Polling every 1.5s…
          </p>
        )}
        {scanResult && (
          <>
            {/* Current scan */}
            <div
              className="p-3 rounded-lg mb-3"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                  Latest Scan
                </span>
                {(scanResult as Record<string, unknown>).readerIndex && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--accent)", color: "white" }}>
                    Reader {String((scanResult as Record<string, unknown>).readerIndex)}
                  </span>
                )}
              </div>
              {(scanResult as Record<string, unknown>).cardText ? (
                <p className="text-sm">
                  Card #{String((scanResult as Record<string, unknown>).cardNumber)} —{" "}
                  <strong>{String((scanResult as Record<string, unknown>).cardText)}</strong>
                </p>
              ) : (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Unknown card (UID: {String((scanResult as Record<string, unknown>).rfidUid || "—")})
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                UID: {String((scanResult as Record<string, unknown>).rfidUid || "—")} | {String((scanResult as Record<string, unknown>).timestamp || "")}
              </p>
            </div>

            {/* Scan history */}
            {Array.isArray((scanResult as Record<string, unknown>).history) &&
              ((scanResult as Record<string, unknown>).history as Record<string, unknown>[]).length > 1 && (
              <div>
                <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                  Scan History (last 20)
                </h4>
                <div className="flex flex-col gap-1">
                  {((scanResult as Record<string, unknown>).history as Record<string, unknown>[]).slice(1).map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 text-xs px-3 py-1.5 rounded"
                      style={{ background: "var(--bg-primary)" }}
                    >
                      <span className="font-mono" style={{ color: "var(--text-secondary)", minWidth: 24 }}>
                        R{String(entry.readerIndex ?? "?")}
                      </span>
                      <span className="font-mono" style={{ color: "var(--text-secondary)", minWidth: 100 }}>
                        {String(entry.rfidUid ?? "—")}
                      </span>
                      <span style={{ flex: 1 }}>
                        {entry.cardText
                          ? <>#{String(entry.cardNumber)} — <strong>{String(entry.cardText)}</strong></>
                          : <span style={{ color: "var(--text-secondary)" }}>Unknown card</span>
                        }
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {String(entry.timestamp ?? "").slice(11, 19)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {!scanResult && scanActive && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No scans received yet. Make sure the plate is powered on and connected to WiFi.
          </p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Plates Tab
   ═══════════════════════════════════════════════════════════ */

function PlatesTab() {
  const [plates, setPlates] = useState<Plate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/plates")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPlates(data);
      })
      .catch(() => setError("Failed to load plates"))
      .finally(() => setLoading(false));
  }, []);

  async function createPlate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/plates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const plate = await res.json();
      setPlates((prev) => [...prev, plate]);
      setNewName("");
      setShowForm(false);
    } catch {
      setError("Failed to create plate");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Register New Plate"}
        </button>
      </div>

      {showForm && (
        <div className="card flex items-end gap-3">
          <div className="flex-1">
            <label className="label">Plate Name</label>
            <input
              className="input"
              placeholder="e.g. Table 1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createPlate()}
              autoFocus
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={creating || !newName.trim()}
            onClick={createPlate}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="animate-pulse" style={{ color: "var(--text-secondary)" }}>
          Loading plates…
        </p>
      ) : plates.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          No plates registered yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plates.map((plate) => (
            <div key={plate.id} className="card">
              <h3 className="font-semibold text-base mb-2">{plate.name}</h3>
              <div className="flex flex-col gap-1 text-sm">
                <div>
                  <span style={{ color: "var(--text-secondary)" }}>Token: </span>
                  <code
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: "var(--bg-primary)" }}
                  >
                    {plate.api_token}
                  </code>
                </div>
                <div>
                  <span style={{ color: "var(--text-secondary)" }}>Active Game: </span>
                  {plate.active_game_id || (
                    <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
                      None
                    </span>
                  )}
                </div>
                {plate.reader_count !== undefined && (
                  <div>
                    <span style={{ color: "var(--text-secondary)" }}>Readers: </span>
                    {plate.reader_count}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Setup Instructions */}
      <div className="card">
        <h3 className="font-semibold mb-2" style={{ color: "var(--accent)" }}>
          Plate Setup Instructions
        </h3>
        <ol className="list-decimal list-inside flex flex-col gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <li>Register a new plate above to generate an API token.</li>
          <li>Flash the plate firmware with the token and your server URL.</li>
          <li>Connect RFID readers to the plate via USB or SPI.</li>
          <li>Create a game with Input Mode set to &quot;Plate&quot; and select this plate.</li>
          <li>Scan physical cards on the readers — the plate sends card events to the server.</li>
        </ol>
      </div>
    </div>
  );
}
