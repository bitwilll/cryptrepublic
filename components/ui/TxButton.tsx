"use client";
import { useState } from "react";

/**
 * The standard write-action button. Standardizes the idle -> pending (wallet
 * signature) -> mining (submitting…) -> success (explorer link + onSuccess) OR
 * error (revert reason in role="alert") state machine extracted from StakePanel.
 * `onRun` is ALWAYS the caller's `*Embedded`/`*External` writer (which already
 * throws on revert via the FROZEN writeEmbedded receipt-wait) — TxButton invents
 * NO signing path. `requireReady()` gates the embedded unlock before pending;
 * for the external path the caller passes a connect+correct-chain gate. Renders
 * TESTNET/SIMULATED chips where money moves or data is mocked (§7.13).
 */

export type TxState = "idle" | "pending" | "mining" | "success" | "error";

export interface TxButtonProps {
  label: string;
  /** Runs the write; resolves with a tx hash. Throws on revert. */
  onRun: () => Promise<`0x${string}`>;
  /** Unlock gate for the EMBEDDED path (return false -> gate opened, do not run). */
  requireReady?: () => boolean;
  explorerBase?: string | null;
  onSuccess?: (hash: `0x${string}`) => void;
  disabled?: boolean;
  disabledReason?: string;
  testnet?: boolean;
  simulated?: boolean;
  confirm?: React.ReactNode;
}

function Chips({ testnet, simulated }: { testnet?: boolean; simulated?: boolean }) {
  if (!testnet && !simulated) return null;
  const chip = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    padding: "2px 6px",
    border: "1px solid var(--line)",
    color: "var(--muted)",
    marginLeft: 8,
  } as const;
  return (
    <span style={{ display: "inline-flex", gap: 6, verticalAlign: "middle" }}>
      {testnet && <span style={chip}>TESTNET</span>}
      {simulated && <span style={chip}>SIMULATED</span>}
    </span>
  );
}

export function TxButton({
  label,
  onRun,
  requireReady,
  explorerBase,
  onSuccess,
  disabled,
  disabledReason,
  testnet,
  simulated,
  confirm,
}: TxButtonProps) {
  const [state, setState] = useState<TxState>("idle");
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (disabled) return;
    if (requireReady && !requireReady()) return; // gate opened; do not run
    setError(null);
    setHash(null);
    setState("pending");
    try {
      // pending = awaiting signature; once onRun resolves we have the hash.
      setState("mining");
      const h = await onRun();
      setHash(h);
      setState("success");
      onSuccess?.(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
      setState("error");
    }
  }

  const busy = state === "pending" || state === "mining";
  const explorerHref = hash && explorerBase ? `${explorerBase}/tx/${hash}` : null;

  return (
    <div>
      <button
        className="btn btn-primary"
        type="button"
        onClick={run}
        disabled={disabled || busy}
        aria-busy={busy}
      >
        {busy ? "Submitting…" : state === "success" ? "✓ Done" : label}
        <Chips testnet={testnet} simulated={simulated} />
      </button>

      {disabled && disabledReason && (
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{disabledReason}</p>
      )}

      {confirm && state === "idle" && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{confirm}</div>
      )}

      {state === "success" && (
        <p style={{ marginTop: 8, fontSize: 12 }}>
          Transaction confirmed.
          {explorerHref && (
            <>
              {" "}
              <a href={explorerHref} target="_blank" rel="noreferrer">
                View transaction ↗
              </a>
            </>
          )}
        </p>
      )}

      {state === "error" && error && (
        <p role="alert" style={{ marginTop: 8, fontSize: 12, color: "#8b3a3a" }}>
          {error}
        </p>
      )}
    </div>
  );
}
