"use client";
import type { PricedAsset } from "@/lib/wallet/services/portfolio";

/**
 * Token list: renders resolvable PricedAssets (native + ERC-20s). The aggregator
 * already excludes address-less/undefined tokens. Prices are REPRESENTATIVE (the
 * header carries the visible disclaimer). The passport is NEVER rendered here —
 * it is a distinct soulbound card (PassportAssetCard).
 */

function num(n: string): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return n;
  return v.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function usd(n: number | undefined): string {
  if (n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function TokenList({ assets }: { assets: PricedAsset[] }) {
  return (
    <article className="pillar" style={{ padding: 0 }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.01em" }}>YOUR TOKENS</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          Native + registered ERC-20s · representative prices
        </div>
      </div>
      {/* Wave 8 A1 (wide-row decision): the 4-column rows are ~350px of fixed
          tracks and cannot fit a 390px viewport — they scroll horizontally
          inside this wrapper (tabular alignment preserved) instead of stacking.
          data-grid="row" exempts them from the shell's ≤760 grid collapse. */}
      <div style={{ overflowX: "auto" }}>
        <div
          data-grid="row"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 120px 110px 120px",
            minWidth: 430,
            padding: "10px 22px",
            fontSize: 10,
            color: "var(--muted)",
            letterSpacing: "0.12em",
            fontWeight: 700,
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span>TOKEN</span>
          <span style={{ textAlign: "right" }}>BALANCE</span>
          <span style={{ textAlign: "right" }}>PRICE</span>
          <span style={{ textAlign: "right" }}>VALUE</span>
        </div>
        {assets.length === 0 && (
          <div style={{ padding: "18px 22px", color: "var(--muted)", fontSize: 13 }}>
            No tokens held on this chain.
          </div>
        )}
        {assets.map((a) => (
          <div
            key={a.symbol + (a.address ?? "native")}
            data-testid={`token-row-${a.symbol}`}
            data-grid="row"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 110px 120px",
              minWidth: 430,
              padding: "14px 22px",
              borderTop: "1px solid var(--line)",
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600 }}>{a.symbol}</span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)" }}>
              {num(a.formatted)}
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--muted)" }}>
              {a.usdPrice !== undefined ? usd(a.usdPrice) : "n/a"}
            </span>
            <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 700 }}>
              {usd(a.usdValue)}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
