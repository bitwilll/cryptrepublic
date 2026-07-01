"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { activeChain } from "@/lib/config/chain";
import { distributorAvailable } from "@/config/contracts";
import { useCitizen } from "@/components/shell/SessionCitizenProvider";
import { useChainInfo } from "@/lib/hooks/useChainInfo";
import { isUnlocked, unlock } from "@/lib/wallet/embedded/session";
import { readCurrentEpoch, readEpoch, readClaimable } from "@/lib/dividends/client";
import { claimDividendEmbedded } from "@/lib/dividends/write";
import { TxButton } from "@/components/ui/TxButton";
import { Ledger } from "@/components/ui/Ledger";
import { UnlockWalletModal } from "@/components/wallet/UnlockWalletModal";

/**
 * Sovereign holdings / dividends (§7.10) client island.
 *
 * LEGAL: dividends paid from sovereign holdings are LIKELY a regulated security
 * (see §10.1). A VISIBLE in-UI note is rendered near the claim panel and MUST
 * NOT be removed — it is asserted by a test. Keep this // LEGAL: marker.
 *
 * The AUM hero + composition come from the SEEDED off-chain AssetCatalogEntry
 * register and are ALWAYS shown behind a visible SEEDED/DEMONSTRATIVE tag — the
 * fabricated register total is NEVER presented as a live on-chain valuation
 * (constraint #5). Claimable is the CONTRACT accrual (readClaimable), NOT the
 * mockup's annualYield/citizenN/4 math; on a fresh chain currentEpoch == 0 → an
 * honest "no dividend epoch open yet" state and a disabled claim.
 */

interface Asset extends Record<string, unknown> {
  ref: string;
  kind: string;
  name: string;
  location: string;
  valueUsd: string;
  yieldBps: number;
  annualYieldUsd: string;
  status: string;
  acquiredAt: string;
}
interface Composition {
  kind: string;
  valueUsd: string;
  shareBps: number;
}
interface AssetsPayload {
  assets: Asset[];
  totalValueUsd: string;
  totalAnnualYieldUsd: string;
  composition: Composition[];
  seeded: boolean;
}
interface DividendClaim extends Record<string, unknown> {
  epochId: string;
  tokenId: string;
  amount: string;
  blockNumber: string;
  txHash: string;
}
interface ConstitutionText {
  key: string;
  title: string;
  body: string;
  citation: string | null;
}

type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

const KINDS: Array<{ k: string; l: string; color: string }> = [
  { k: "all", l: "All", color: "var(--ink)" },
  { k: "re", l: "Real estate", color: "var(--gold)" },
  { k: "ip", l: "Patents & IP", color: "var(--success)" },
  { k: "eq", l: "Equity", color: "#5a6a7d" },
  { k: "tr", l: "Crypto reserves", color: "#1957d3" },
];

export function HoldingsApp() {
  const chainId = activeChain().primaryChainId;
  const chain = useChainInfo();
  const { isCitizen, tokenId } = useCitizen();

  const [assets, setAssets] = useState<Load<AssetsPayload>>({ status: "loading" });
  const [claims, setClaims] = useState<Load<DividendClaim[]>>({ status: "loading" });
  const [doctrine, setDoctrine] = useState<ConstitutionText[]>([]);
  const [showUnlock, setShowUnlock] = useState(false);

  const loadAssets = useCallback(() => {
    setAssets({ status: "loading" });
    fetch("/api/holdings/assets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: AssetsPayload) => setAssets({ status: "ok", data: d }))
      .catch(() => setAssets({ status: "error" }));
  }, []);

  const loadClaims = useCallback(() => {
    setClaims({ status: "loading" });
    fetch("/api/holdings/dividends")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { claims?: DividendClaim[] }) =>
        setClaims({ status: "ok", data: Array.isArray(d.claims) ? d.claims : [] }),
      )
      .catch(() => setClaims({ status: "error" }));
  }, []);

  useEffect(() => {
    loadAssets();
    loadClaims();
    fetch("/api/constitution")
      .then((r) => (r.ok ? r.json() : { texts: [] }))
      .then((d: { texts?: ConstitutionText[] }) =>
        setDoctrine(Array.isArray(d.texts) ? d.texts : []),
      )
      .catch(() => setDoctrine([]));
  }, [loadAssets, loadClaims]);

  const requireReady = useCallback((): boolean => {
    if (isUnlocked()) return true;
    setShowUnlock(true);
    return false;
  }, []);

  const onUnlock = useCallback(async (pass: string) => {
    await unlock(pass);
    setShowUnlock(false);
  }, []);

  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">SOVEREIGN HOLDINGS</div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20, alignItems: "start" }}
      >
        <HoldingsHero state={assets} onRetry={loadAssets} />
        <DividendClaimPanel
          chainId={chainId}
          isCitizen={isCitizen}
          tokenId={tokenId}
          requireReady={requireReady}
          explorerBase={chain.explorerBase}
          onClaimed={loadClaims}
        />
      </div>

      <AssetRegisterTable state={assets} onRetry={loadAssets} />

      <div
        style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, alignItems: "start" }}
      >
        <DividendHistoryCard
          state={claims}
          explorerBase={chain.explorerBase}
          onRetry={loadClaims}
        />
        <DoctrineCard texts={doctrine} />
      </div>

      {showUnlock && (
        <UnlockWalletModal onUnlock={onUnlock} onCancel={() => setShowUnlock(false)} />
      )}
    </div>
  );
}

function HoldingsHero({ state, onRetry }: { state: Load<AssetsPayload>; onRetry: () => void }) {
  return (
    <article className="pillar" data-testid="holdings-hero" style={{ padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div
          style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
        >
          TOTAL ASSETS UNDER REPUBLIC
        </div>
        <span
          data-testid="seeded-tag"
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            padding: "2px 6px",
            border: "1px solid var(--gold)",
            color: "var(--gold)",
          }}
        >
          SEEDED · DEMONSTRATIVE
        </span>
      </div>

      {state.status === "loading" && <Skeleton lines={2} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="holdings-hero-error" />}
      {state.status === "ok" && (
        <>
          <div
            style={{
              marginTop: 8,
              fontSize: 52,
              fontWeight: 800,
              fontFamily: "var(--mono)",
              letterSpacing: "-0.03em",
            }}
          >
            {formatUsd(state.data.totalValueUsd)}
          </div>
          <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 13, maxWidth: 520 }}>
            A representative off-chain register of the estate — NOT a live on-chain valuation. Every
            figure below is demonstrative.
          </p>
          <CompositionCard composition={state.data.composition} total={state.data.totalValueUsd} />
        </>
      )}
    </article>
  );
}

function CompositionCard({ composition, total }: { composition: Composition[]; total: string }) {
  const totalBig = BigInt(total || "0");
  return (
    <div data-testid="composition" style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
        >
          COMPOSITION
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            padding: "2px 6px",
            border: "1px solid var(--line)",
            color: "var(--muted)",
          }}
        >
          SEEDED
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          height: 16,
          display: "flex",
          overflow: "hidden",
          border: "1px solid var(--line)",
        }}
      >
        {composition.map((c) => {
          const color = KINDS.find((k) => k.k === c.kind)?.color ?? "var(--muted)";
          return <div key={c.kind} style={{ width: `${c.shareBps / 100}%`, background: color }} />;
        })}
      </div>
      <div
        style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}
      >
        {composition.map((c) => {
          const meta = KINDS.find((k) => k.k === c.kind);
          const shareOfTotal =
            totalBig > 0n
              ? (Number((BigInt(c.valueUsd) * 10000n) / totalBig) / 100).toFixed(1)
              : "0";
          return (
            <div
              key={c.kind}
              style={{
                padding: "10px 12px",
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderLeft: `3px solid ${meta?.color ?? "var(--muted)"}`,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                }}
              >
                {(meta?.l ?? c.kind).toUpperCase()}
              </div>
              <div
                style={{ fontSize: 18, fontWeight: 800, marginTop: 2, fontFamily: "var(--mono)" }}
              >
                {formatUsd(c.valueUsd)}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                {shareOfTotal}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DividendClaimPanel({
  chainId,
  isCitizen,
  tokenId,
  requireReady,
  explorerBase,
  onClaimed,
}: {
  chainId: number;
  isCitizen: boolean;
  tokenId: bigint | null;
  requireReady: () => boolean;
  explorerBase: string | null;
  onClaimed: () => void;
}) {
  const [epochId, setEpochId] = useState<bigint | null>(null);
  const [open, setOpen] = useState(false);
  const [claimable, setClaimable] = useState<bigint | null>(null);
  const [loaded, setLoaded] = useState(false);

  const available = safeDistributorAvailable(chainId);

  useEffect(() => {
    let alive = true;
    if (!available) {
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const cur = await readCurrentEpoch(chainId);
        if (!alive) return;
        if (cur === 0n) {
          setEpochId(null);
          setOpen(false);
          setClaimable(null);
          setLoaded(true);
          return;
        }
        setEpochId(cur);
        const ep = await readEpoch(chainId, cur);
        if (!alive) return;
        setOpen(ep.open);
        if (isCitizen && tokenId !== null) {
          const c = await readClaimable(chainId, cur, tokenId);
          if (alive) setClaimable(c);
        } else {
          setClaimable(null);
        }
      } catch {
        if (alive) {
          setEpochId(null);
          setClaimable(null);
        }
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chainId, isCitizen, tokenId, available]);

  const noEpoch = loaded && (epochId === null || !open);
  const canClaim =
    isCitizen && tokenId !== null && epochId !== null && open && (claimable ?? 0n) > 0n;

  return (
    <article className="pillar" data-testid="dividend-panel" style={{ padding: "24px 28px" }}>
      <div
        style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        YOUR DIVIDEND · CLAIMABLE
      </div>

      {!loaded && <Skeleton lines={2} />}

      {loaded && (
        <>
          {noEpoch ? (
            <p data-testid="no-epoch" style={{ marginTop: 12, color: "var(--muted)" }}>
              No dividend epoch is open yet. When the Republic opens one, your share will appear
              here.
            </p>
          ) : (
            <div
              style={{
                marginTop: 8,
                fontSize: 40,
                fontWeight: 800,
                color: "var(--gold)",
                fontFamily: "var(--mono)",
              }}
            >
              {formatCrypt(claimable != null ? claimable.toString() : "0")} $CRYPT
            </div>
          )}

          {!isCitizen && (
            <p style={{ marginTop: 10, fontSize: 13 }}>
              Mint your passport to receive dividends.{" "}
              <Link href="/dashboard/mint">Mint your passport →</Link>
            </p>
          )}

          <div style={{ marginTop: 16 }}>
            <TxButton
              label="CLAIM DIVIDEND →"
              disabled={!canClaim}
              disabledReason={
                !isCitizen
                  ? "Mint your passport to receive dividends"
                  : noEpoch
                    ? "No open dividend epoch."
                    : (claimable ?? 0n) === 0n
                      ? "Nothing to claim for this epoch."
                      : undefined
              }
              requireReady={requireReady}
              explorerBase={explorerBase}
              testnet
              onRun={() => claimDividendEmbedded(chainId, epochId as bigint, tokenId as bigint)}
              onSuccess={() => {
                setClaimable(0n);
                onClaimed();
              }}
            />
          </div>

          {/* LEGAL: visible regulated-security note (constraint #6). Do not remove. */}
          <p
            data-testid="legal-note"
            style={{ marginTop: 14, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}
          >
            <strong>Legal note.</strong> Dividends paid from sovereign holdings are likely a
            regulated security. Claiming may carry tax and securities-law obligations in your
            jurisdiction — see the Republic&rsquo;s disclosures.
          </p>
        </>
      )}
    </article>
  );
}

function AssetRegisterTable({
  state,
  onRetry,
}: {
  state: Load<AssetsPayload>;
  onRetry: () => void;
}) {
  const [tab, setTab] = useState("all");
  const filtered = useMemo(() => {
    const assets = state.status === "ok" ? state.data.assets : [];
    return tab === "all" ? assets : assets.filter((a) => a.kind === tab);
  }, [state, tab]);

  return (
    <article className="pillar" style={{ padding: "24px 28px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 20 }}>The asset register</h3>
          <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
            Off-chain by nature · demonstrative register (SEEDED)
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {KINDS.map((kn) => (
            <button
              key={kn.k}
              type="button"
              onClick={() => setTab(kn.k)}
              aria-pressed={tab === kn.k}
              className="btn"
              style={{
                padding: "6px 12px",
                fontSize: 11,
                background: tab === kn.k ? "var(--ink)" : "transparent",
                color: tab === kn.k ? "#fff" : "var(--ink)",
              }}
            >
              {kn.l}
            </button>
          ))}
        </div>
      </div>

      {state.status === "loading" && <Skeleton lines={4} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="assets-error" />}
      {state.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <Ledger
            columns={[
              { key: "ref", label: "ID" },
              { key: "name", label: "Asset" },
              { key: "location", label: "Location / holder" },
              {
                key: "valueUsd",
                label: "Value",
                align: "right",
                render: (a) => formatUsd(a.valueUsd),
              },
              {
                key: "yieldBps",
                label: "Yield",
                align: "right",
                render: (a) => `${(Number(a.yieldBps) / 100).toFixed(1)}%`,
              },
              { key: "status", label: "Status", align: "right" },
            ]}
            rows={filtered}
            getRowKey={(a) => a.ref}
            empty="The register is empty."
          />
        </div>
      )}
    </article>
  );
}

function DividendHistoryCard({
  state,
  explorerBase,
  onRetry,
}: {
  state: Load<DividendClaim[]>;
  explorerBase: string | null;
  onRetry: () => void;
}) {
  return (
    <article className="pillar" data-testid="dividend-history" style={{ padding: "24px 28px" }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>Your dividend history</h3>
      <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
        Paid in $CRYPT, from DividendClaimed events.
      </p>
      {state.status === "loading" && <Skeleton lines={3} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="dividend-history-error" />}
      {state.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <Ledger
            columns={[
              { key: "epochId", label: "Epoch" },
              {
                key: "amount",
                label: "Amount",
                align: "right",
                render: (c) => `${formatCrypt(c.amount)} $CRYPT`,
              },
              { key: "blockNumber", label: "Block", align: "right" },
            ]}
            rows={state.data}
            getRowKey={(c) => c.txHash}
            empty="No dividends claimed yet."
          />
          {explorerBase && state.data.length > 0 && (
            <p style={{ marginTop: 10, fontSize: 12 }}>
              <a href={explorerBase} target="_blank" rel="noreferrer">
                View on explorer ↗
              </a>
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function DoctrineCard({ texts }: { texts: ConstitutionText[] }) {
  const doctrine =
    texts.find((t) => t.key.includes("doctrine")) ??
    texts.find((t) => t.key === "preamble") ??
    null;
  return (
    <article className="pillar" style={{ padding: "24px 28px" }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>The doctrine</h3>
      {doctrine ? (
        <>
          <p style={{ marginTop: 14, lineHeight: 1.6 }}>{doctrine.body}</p>
          {doctrine.citation && (
            <div
              style={{
                marginTop: 14,
                fontSize: 12,
                color: "var(--muted)",
                fontFamily: "var(--mono)",
              }}
            >
              — {doctrine.citation}
            </div>
          )}
        </>
      ) : (
        <p style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
          The doctrine has not been recorded yet.
        </p>
      )}
    </article>
  );
}

/** Format a whole-USD string with M/K suffix or grouped digits. */
function formatUsd(usd: string | null): string {
  if (usd == null) return "$0";
  const n = Number(usd);
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString("en-US").replace(/,/g, " ")}`;
}

/** Format a wei string (18 decimals) as a $CRYPT amount with spaces. */
function formatCrypt(wei: string | null): string {
  if (wei == null) return "0";
  const whole = formatUnits(BigInt(wei), 18);
  const [int, frac] = whole.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac && frac !== "0" ? `${grouped}.${frac.slice(0, 4)}` : grouped;
}

function safeDistributorAvailable(chainId: number): boolean {
  try {
    return distributorAvailable(chainId);
  } catch {
    return false;
  }
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          data-testid="skeleton-line"
          style={{ height: 14, background: "var(--paper)", border: "1px solid var(--line)" }}
        />
      ))}
    </div>
  );
}

function CardError({ onRetry, testid }: { onRetry: () => void; testid: string }) {
  return (
    <div data-testid={testid} style={{ marginTop: 14 }}>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>Could not load this card.</p>
      <button className="btn" type="button" onClick={onRetry} style={{ marginTop: 8 }}>
        Retry
      </button>
    </div>
  );
}
