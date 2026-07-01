"use client";
import { useState } from "react";
import { getAddress } from "viem";

/**
 * Wallet hero: portfolio `$` total, the checksummed EVM address (truncated) with
 * a COPY button, and the SEND / RECEIVE / SWAP / STAKE / BRIDGE action buttons.
 *
 * HONESTY (finding #8/#15): a VISIBLE "Representative prices — not a live oracle"
 * disclaimer renders directly under the total. The total is derived from static
 * representative prices ($CRYPT=1 etc.) and must not read as a live valuation.
 * The chrome shows the REAL chain name + live block number (NOT the mockup's
 * fabricated "CR-L2 · CHAIN ID 7331 · BLOCK 21 408 932").
 */

const ACTIONS = ["SEND", "RECEIVE", "SWAP", "STAKE", "BRIDGE"] as const;
export type WalletAction = (typeof ACTIONS)[number];

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function truncate(addr: string): string {
  return `${addr.slice(0, 22)}…${addr.slice(-10)}`;
}

export function PortfolioHeader({
  totalUsd,
  evmAddress,
  chainName,
  blockNumber,
  stakingEnabled,
  onAction,
}: {
  totalUsd: number;
  evmAddress: string;
  chainName: string | null;
  blockNumber: bigint | null;
  stakingEnabled: boolean;
  onAction: (action: WalletAction) => void;
}) {
  const [copied, setCopied] = useState(false);
  const checksummed = safeChecksum(evmAddress);

  async function copy() {
    try {
      await navigator.clipboard.writeText(checksummed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <article
      className="pillar"
      style={{ background: "var(--navy)", color: "#fff", padding: "28px 32px" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "start",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: "var(--gold)",
              letterSpacing: "0.12em",
              fontWeight: 700,
            }}
          >
            CITIZEN WALLET · {chainName ?? "—"}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 14,
              color: "rgba(255,255,255,0.65)",
              fontFamily: "var(--mono)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span data-testid="wallet-address">{truncate(checksummed)}</span>
            <button
              type="button"
              onClick={copy}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "var(--gold)",
                padding: "3px 8px",
                fontSize: 10,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.06em",
                fontWeight: 700,
              }}
            >
              {copied ? "COPIED ✓" : "COPY"}
            </button>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            fontSize: 10,
            fontFamily: "var(--mono)",
            color: "var(--gold)",
            alignItems: "center",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#7cffa6",
              display: "inline-block",
            }}
          />
          <span style={{ letterSpacing: "0.08em" }} data-testid="header-block">
            {blockNumber !== null ? `SYNCED · BLOCK ${blockNumber.toString()}` : "SYNCING…"}
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: 26,
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span
          data-testid="portfolio-total"
          style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          {formatUsd(totalUsd)}
        </span>
      </div>
      <div
        data-testid="representative-disclaimer"
        style={{
          marginTop: 8,
          fontSize: 12,
          color: "rgba(255,255,255,0.55)",
          fontFamily: "var(--mono)",
        }}
      >
        Representative prices — not a live oracle.
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {ACTIONS.map((a) => {
          const disabled = a === "STAKE" && !stakingEnabled;
          const primary = a === "SEND";
          return (
            <button
              key={a}
              type="button"
              disabled={disabled}
              onClick={() => onAction(a)}
              style={{
                padding: "11px 18px",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1,
                background: primary ? "var(--gold)" : "rgba(255,255,255,0.08)",
                color: primary ? "var(--navy)" : "#fff",
                border: primary ? "none" : "1px solid rgba(255,255,255,0.18)",
                fontFamily: "inherit",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.06em",
              }}
            >
              {a === "STAKE" ? "STAKE" : a}
            </button>
          );
        })}
      </div>
    </article>
  );
}

/** getAddress but never throws in render (falls back to the raw string). */
function safeChecksum(addr: string): string {
  try {
    return getAddress(addr);
  } catch {
    return addr;
  }
}
