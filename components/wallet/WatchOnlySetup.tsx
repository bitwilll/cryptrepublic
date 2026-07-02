"use client";
import { useState } from "react";
import { getAddress } from "viem";
import { setWalletMode } from "@/lib/wallet/mode";
import { WatchOnlyBadge } from "./WatchOnlyBadge";

/**
 * Watch-only setup (Wave 11 C1): validate + persist a PUBLIC EVM address to
 * track. `getAddress` checksums (a lowercased valid address is accepted and
 * normalized); an invalid address is an inline error and nothing is persisted.
 */
export function WatchOnlySetup({
  onConfigured,
}: {
  onConfigured: (address: `0x${string}`) => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let address: `0x${string}`;
    try {
      address = getAddress(input.trim());
    } catch {
      setError("Not a valid EVM address.");
      return;
    }
    setBusy(true);
    try {
      await setWalletMode({ mode: "watchonly", watchAddress: address });
      onConfigured(address);
    } catch {
      setError("Could not save the watched address.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 20 }}>
      <WatchOnlyBadge />
      <p style={{ color: "var(--muted)", marginTop: 12, maxWidth: 560 }}>
        Enter a public EVM address to track. This device stays read-only — transactions are signed
        on a separate offline device via QR codes.
      </p>
      <label htmlFor="watch-address" style={{ display: "block", marginTop: 16, marginBottom: 8 }}>
        EVM address to watch
      </label>
      <input
        id="watch-address"
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="0x…"
        autoComplete="off"
        spellCheck={false}
        data-testid="watch-address-input"
        style={{
          width: "100%",
          maxWidth: 460,
          padding: 10,
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontFamily: "var(--mono, monospace)",
          fontSize: 13,
        }}
      />
      {error && (
        <p role="alert" style={{ color: "#b00020", marginTop: 12 }}>
          {error}
        </p>
      )}
      <div style={{ marginTop: 16 }}>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy}
          data-testid="watch-address-save"
        >
          {busy ? "Saving…" : "Track this address"}
        </button>
      </div>
    </form>
  );
}
