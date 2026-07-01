"use client";
import { formatUnits } from "viem";
import type { ChainStats } from "@/lib/wallet/services/chainStats";

/**
 * Honest live chain stats. Every value is REAL (chain name, live block number,
 * real gas via estimateFeesPerGas, explorer link). The mockup's fabricated
 * validators / TPS / finality are rendered as the `representativeNote` (verbatim),
 * NEVER as live telemetry (finding #10).
 */
export function ChainStatsPanel({ stats }: { stats: ChainStats | null }) {
  return (
    <article className="pillar" style={{ padding: 22 }}>
      <div
        style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        NETWORK STATUS
      </div>
      {!stats && (
        <div style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
          Chain stats unavailable.
        </div>
      )}
      {stats && (
        <>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 12,
            }}
          >
            {(
              [
                ["Chain", stats.chainName],
                ["Chain ID", String(stats.chainId)],
                ["Block height", stats.blockNumber.toString()],
                ["Gas (max fee)", `${formatUnits(stats.gasMaxFeePerGasWei, 9)} gwei`],
              ] as const
            ).map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <span style={{ color: "var(--muted)" }}>{k}</span>
                <span
                  data-testid={`chainstat-${k.replace(/\s+/g, "-").toLowerCase()}`}
                  style={{ fontWeight: 600, fontFamily: "var(--mono)" }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
          <a
            href={stats.explorerBase}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block",
              marginTop: 12,
              fontSize: 12,
              color: "var(--blue)",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textDecoration: "none",
            }}
          >
            VIEW ON EXPLORER ↗
          </a>
          <p
            data-testid="chainstat-representative-note"
            style={{ marginTop: 14, fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}
          >
            {stats.representativeNote}
          </p>
        </>
      )}
    </article>
  );
}
