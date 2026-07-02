"use client";
import type { WalletMode } from "@/lib/wallet/mode";

/**
 * Wallet mode chooser (Wave 11 A2) — three honest cards, one per
 * non-custodial mode. Real keyboard-focusable buttons (never onClick divs).
 */
const MODES: { mode: WalletMode; testid: string; title: string; desc: string }[] = [
  {
    mode: "embedded",
    testid: "mode-embedded",
    title: "Embedded wallet",
    desc: "Create or import a recovery phrase, encrypted on this device. Keys never leave it and CryptRepublic can never recover them.",
  },
  {
    mode: "hardware",
    testid: "mode-hardware",
    title: "Hardware / external wallet",
    desc: "Connect a wallet you already have (browser extension or WalletConnect — incl. Ledger via Ledger Live). Keys stay on your device.",
  },
  {
    mode: "watchonly",
    testid: "mode-watchonly",
    title: "Watch-only + air-gapped",
    desc: "Track a public address read-only. Transactions are signed on a separate offline device via QR codes — no key ever touches this one.",
  },
];

export function WalletModeSelect({ onSelect }: { onSelect: (mode: WalletMode) => void }) {
  return (
    <div
      role="group"
      aria-label="Choose a wallet mode"
      style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}
    >
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          data-testid={m.testid}
          className="pillar"
          onClick={() => onSelect(m.mode)}
          style={{
            textAlign: "left",
            padding: "18px 22px",
            cursor: "pointer",
            background: "transparent",
            font: "inherit",
            color: "inherit",
          }}
        >
          <span style={{ display: "block", fontSize: 17, fontWeight: 700 }}>{m.title}</span>
          <span style={{ display: "block", marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
            {m.desc}
          </span>
        </button>
      ))}
    </div>
  );
}
