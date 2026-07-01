"use client";
import type { TxRow } from "@/lib/wallet/services/history";

/**
 * On-chain activity ledger — renders real `evmHistory` rows (block/time,
 * direction in/out, counterparty, value, explorer link). Empty state when there
 * are no rows. Does NOT fabricate the mockup's demo rows.
 */
export function ActivityLedger({
  rows,
  explorerBase,
}: {
  rows: TxRow[];
  explorerBase: string | null;
}) {
  return (
    <article className="pillar" style={{ padding: 0 }} data-testid="activity-ledger">
      <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.01em" }}>
          ON-CHAIN ACTIVITY
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          Recent transactions for this address
        </div>
      </div>
      {rows.length === 0 ? (
        <div
          data-testid="activity-empty"
          style={{ padding: "18px 22px", color: "var(--muted)", fontSize: 13 }}
        >
          No on-chain activity yet.
        </div>
      ) : (
        rows.map((r) => (
          <div
            key={r.hash}
            data-testid={`activity-row-${r.hash}`}
            style={{
              display: "grid",
              gridTemplateColumns: "80px 1fr 140px",
              padding: "12px 22px",
              borderTop: "1px solid var(--line)",
              alignItems: "center",
              fontSize: 13,
              gap: 8,
            }}
          >
            <span
              data-testid={`activity-dir-${r.hash}`}
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: r.direction === "in" ? "var(--success)" : "var(--gold)",
              }}
            >
              {r.direction === "in" ? "RECEIVE" : "SEND"}
            </span>
            <span
              style={{
                fontFamily: "var(--mono, monospace)",
                fontSize: 11,
                color: "var(--muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {r.direction === "in" ? r.from : r.to}
            </span>
            <span
              style={{ textAlign: "right", fontFamily: "var(--mono, monospace)", fontWeight: 700 }}
            >
              {explorerBase ? (
                <a
                  href={`${explorerBase}/tx/${r.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--blue)", textDecoration: "none" }}
                >
                  {r.value} ↗
                </a>
              ) : (
                r.value
              )}
            </span>
          </div>
        ))
      )}
    </article>
  );
}
