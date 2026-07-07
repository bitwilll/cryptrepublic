"use client";
import { useState } from "react";
import { getSwapQuote, type MockQuote } from "@/lib/wallet/services/swap";

/**
 * SWAP / BRIDGE modal — a clearly-labeled TESTNET-MOCK. Renders a mock quote
 * (`estOut`) behind a prominent "TESTNET MOCK · SIMULATED — no funds move"
 * banner. There is NO execute/sign button (no signer path in Wave 6). On mainnet
 * `getSwapQuote` throws → we catch and show "lands in a later wave". The same
 * component serves both the SWAP and BRIDGE actions.
 */
export function SwapBridgeModal({
  mode,
  onClose,
}: {
  mode: "swap" | "bridge";
  onClose: () => void;
}) {
  const [fromToken, setFromToken] = useState("ETH");
  const [toToken, setToToken] = useState("CRYPT");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<MockQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function getQuote() {
    setError(null);
    setQuote(null);
    let amt: bigint;
    try {
      amt = BigInt(Math.floor(Number(amount) * 1e6)); // scaled for the mock only
      if (amt <= 0n) throw new Error("zero");
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    try {
      const q = await getSwapQuote(fromToken, toToken, amt);
      setQuote(q);
    } catch {
      setError("Swap/bridge lands in a later wave.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "swap" ? "Swap" : "Bridge"}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,31,51,0.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 24,
          width: "min(460px, 94vw)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>{mode === "swap" ? "Swap" : "Bridge"}</h2>

        <div
          data-testid="testnet-mock-banner"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "color-mix(in srgb, #b04141 10%, transparent)",
            border: "1px solid #b04141",
            color: "#8b3a3a",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          TESTNET MOCK · SIMULATED — no funds move.
        </div>

        <label style={{ display: "block", fontSize: 12, marginTop: 14, marginBottom: 6 }}>
          From
          <input
            data-testid="swap-from"
            type="text"
            value={fromToken}
            onChange={(e) => setFromToken(e.target.value)}
            style={{
              width: "100%",
              marginTop: 6,
              padding: 10,
              border: "1px solid var(--line)",
              borderRadius: 8,
            }}
          />
        </label>
        <label style={{ display: "block", fontSize: 12, marginTop: 10, marginBottom: 6 }}>
          To
          <input
            data-testid="swap-to"
            type="text"
            value={toToken}
            onChange={(e) => setToToken(e.target.value)}
            style={{
              width: "100%",
              marginTop: 6,
              padding: 10,
              border: "1px solid var(--line)",
              borderRadius: 8,
            }}
          />
        </label>
        <label style={{ display: "block", fontSize: 12, marginTop: 10, marginBottom: 6 }}>
          Amount
          <input
            data-testid="swap-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              width: "100%",
              marginTop: 6,
              padding: 10,
              border: "1px solid var(--line)",
              borderRadius: 8,
            }}
          />
        </label>

        {quote && (
          <p data-testid="swap-quote" style={{ marginTop: 12, fontSize: 13 }}>
            Est. out (simulated):{" "}
            <span style={{ fontFamily: "var(--mono, monospace)", fontWeight: 700 }}>
              {quote.estOut}
            </span>{" "}
            {quote.toToken}
          </p>
        )}
        {error && (
          <p role="alert" style={{ color: "#8b3a3a", marginTop: 12, fontSize: 12 }}>
            {error}
          </p>
        )}

        {/* NO execute/sign button — quote only. */}
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={getQuote}>
            {busy ? "Quoting…" : "Get mock quote"}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
