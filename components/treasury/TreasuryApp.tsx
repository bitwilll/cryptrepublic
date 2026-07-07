"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { activeChain } from "@/lib/config/chain";
import { treasuryAvailable } from "@/config/contracts";
import { useCitizen } from "@/components/shell/SessionCitizenProvider";
import { useChainInfo } from "@/lib/hooks/useChainInfo";
import { stakingAvailable, readStakePosition } from "@/lib/wallet/services/staking";
import { Ledger } from "@/components/ui/Ledger";
import { Spark } from "@/components/ui/Spark";

/**
 * Treasury (§7.9) client island — READ-ONLY. Reserves are the REAL on-chain
 * balances (honest near-0 on a fresh chain — NEVER "$14.20M"); allocations are
 * governance-ratified TARGETS (tagged as targets, overlaid with on-chain
 * allocationBps when set); disbursements are `Disbursed` logs (empty on a fresh
 * chain). The only write affordance is a STAKE link to /dashboard/wallet — the
 * treasury moves only via executed governance proposals.
 */

interface Summary {
  available: boolean;
  cryptWei: string | null;
  ethWei: string | null;
}
interface Allocation extends Record<string, unknown> {
  bucket: string;
  label: string;
  targetBps: number;
  color: string;
  onchainBps: number | null;
}
interface Flow extends Record<string, unknown> {
  token: string;
  to: string;
  amount: string;
  blockNumber: string;
  txHash: string;
  status: string;
}

type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

export function TreasuryApp() {
  const chainId = activeChain().primaryChainId;
  const chain = useChainInfo();
  const available = safeTreasuryAvailable(chainId);

  const [summary, setSummary] = useState<Load<Summary>>({ status: "loading" });
  const [allocations, setAllocations] = useState<Load<Allocation[]>>({ status: "loading" });
  const [flows, setFlows] = useState<Load<Flow[]>>({ status: "loading" });

  const loadSummary = useCallback(() => {
    setSummary({ status: "loading" });
    fetch("/api/treasury/summary")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: Summary) => setSummary({ status: "ok", data: d }))
      .catch(() => setSummary({ status: "error" }));
  }, []);

  const loadAllocations = useCallback(() => {
    setAllocations({ status: "loading" });
    fetch("/api/treasury/allocations")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { allocations?: Allocation[] }) =>
        setAllocations({ status: "ok", data: Array.isArray(d.allocations) ? d.allocations : [] }),
      )
      .catch(() => setAllocations({ status: "error" }));
  }, []);

  const loadFlows = useCallback(() => {
    setFlows({ status: "loading" });
    fetch("/api/treasury/flows")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { flows?: Flow[] }) =>
        setFlows({ status: "ok", data: Array.isArray(d.flows) ? d.flows : [] }),
      )
      .catch(() => setFlows({ status: "error" }));
  }, []);

  useEffect(() => {
    loadSummary();
    loadAllocations();
    loadFlows();
  }, [loadSummary, loadAllocations, loadFlows]);

  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">TREASURY</div>

      <TreasuryHero state={summary} available={available} onRetry={loadSummary} />

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
        <AllocationCard state={allocations} onRetry={loadAllocations} />
        <MyHoldingsCard chainId={chainId} />
      </div>

      <DisbursementsLedger state={flows} explorerBase={chain.explorerBase} onRetry={loadFlows} />
    </div>
  );
}

function TreasuryHero({
  state,
  available,
  onRetry,
}: {
  state: Load<Summary>;
  available: boolean;
  onRetry: () => void;
}) {
  return (
    <article className="pillar" data-testid="treasury-hero" style={{ padding: "28px 32px" }}>
      <div
        style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        TREASURY · GENERAL RESERVE
      </div>

      {state.status === "loading" && <Skeleton lines={2} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="treasury-hero-error" />}
      {state.status === "ok" &&
        (!available || !state.data.available ? (
          <p data-testid="treasury-unavailable" style={{ color: "var(--muted)", marginTop: 12 }}>
            The treasury is not deployed on this network yet. Reserves will appear once it is
            registered.
          </p>
        ) : (
          <>
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "baseline",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 56,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  fontFamily: "var(--mono)",
                }}
              >
                {formatCrypt(state.data.cryptWei)} $CRYPT
              </span>
              <span style={{ fontSize: 14, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                + {formatEth(state.data.ethWei)} ETH
              </span>
            </div>
            <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 13 }}>
              Real reserves held by CryptTreasury · governed by every citizen.
            </p>
            <div style={{ marginTop: 8 }}>
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
                REPRESENTATIVE SERIES
              </span>
              <Spark points={[]} color="var(--gold-d)" width={720} height={80} />
            </div>
          </>
        ))}
    </article>
  );
}

function AllocationCard({ state, onRetry }: { state: Load<Allocation[]>; onRetry: () => void }) {
  return (
    <article className="pillar" data-testid="allocation-card" style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Allocation by mandate</h3>
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
          TARGETS · NOT LIVE SPLITS
        </span>
      </div>

      {state.status === "loading" && <Skeleton lines={4} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="allocation-error" />}
      {state.status === "ok" && state.data.length === 0 && (
        <p style={{ color: "var(--muted)", marginTop: 14, fontSize: 13 }}>
          No allocation targets ratified yet.
        </p>
      )}
      {state.status === "ok" && state.data.length > 0 && (
        <>
          <div
            style={{
              marginTop: 18,
              height: 16,
              display: "flex",
              overflow: "hidden",
              border: "1px solid var(--line)",
            }}
          >
            {state.data.map((a) => (
              <div key={a.bucket} style={{ width: `${a.targetBps / 100}%`, background: a.color }} />
            ))}
          </div>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            {state.data.map((a) => (
              <div
                key={a.bucket}
                data-grid="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "14px 1fr 70px 90px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    background: a.color,
                    border: "1px solid var(--line)",
                  }}
                />
                <span style={{ fontWeight: 600 }}>{a.label}</span>
                <span style={{ textAlign: "right", fontWeight: 700, fontFamily: "var(--mono)" }}>
                  {(a.targetBps / 100).toFixed(0)}%
                </span>
                <span
                  style={{
                    textAlign: "right",
                    fontSize: 11,
                    color: "var(--muted)",
                    fontFamily: "var(--mono)",
                  }}
                >
                  {a.onchainBps != null ? `on-chain ${(a.onchainBps / 100).toFixed(0)}%` : "target"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function MyHoldingsCard({ chainId }: { chainId: number }) {
  const { isCitizen, address } = useCitizen();
  const [staked, setStaked] = useState<bigint | null>(null);

  useEffect(() => {
    let alive = true;
    if (!address || !safeStakingAvailable(chainId)) {
      setStaked(null);
      return;
    }
    readStakePosition(chainId, address)
      .then((p) => alive && setStaked(p.staked))
      .catch(() => alive && setStaked(null));
    return () => {
      alive = false;
    };
  }, [chainId, address]);

  return (
    <article className="pillar" style={{ padding: "24px 28px" }}>
      <div
        style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        YOUR HOLDINGS
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <Row
          label="Staked"
          value={staked != null ? `${formatCrypt(staked.toString())} $CRYPT` : "—"}
        />
        <Row label="Voting weight" value={isCitizen ? "1.00" : "0 (mint required)"} />
      </div>
      <Link
        className="btn btn-primary"
        href="/dashboard/wallet"
        style={{ marginTop: 18, width: "100%" }}
      >
        STAKE →
      </Link>
      <p style={{ marginTop: 10, fontSize: 11, color: "var(--muted)" }}>
        The treasury moves only via executed governance proposals — there is no arbitrary spend from
        this screen.
      </p>
    </article>
  );
}

function DisbursementsLedger({
  state,
  explorerBase,
  onRetry,
}: {
  state: Load<Flow[]>;
  explorerBase: string | null;
  onRetry: () => void;
}) {
  return (
    <article className="pillar" data-testid="disbursements" style={{ padding: "24px 28px" }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>Disbursements</h3>
      <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 13 }}>
        Ratified transfers on chain (Disbursed events).
      </p>
      {state.status === "loading" && <Skeleton lines={3} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="disbursements-error" />}
      {state.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <Ledger
            columns={[
              { key: "blockNumber", label: "Block" },
              { key: "to", label: "Recipient" },
              {
                key: "amount",
                label: "Amount",
                align: "right",
                render: (r) => `${formatCrypt(r.amount)} $CRYPT`,
              },
              { key: "status", label: "Status", align: "right" },
            ]}
            rows={state.data}
            getRowKey={(r) => r.txHash}
            empty="No disbursements yet."
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderTop: "1px solid var(--line)",
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: "var(--mono)" }}>{value}</span>
    </div>
  );
}

/** Format a wei string (18 decimals) as a $CRYPT amount with spaces. */
function formatCrypt(wei: string | null): string {
  if (wei == null) return "0";
  const whole = formatUnits(BigInt(wei), 18);
  const [int, frac] = whole.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac && frac !== "0" ? `${grouped}.${frac.slice(0, 2)}` : grouped;
}

function formatEth(wei: string | null): string {
  if (wei == null) return "0";
  const whole = formatUnits(BigInt(wei), 18);
  const [int, frac] = whole.split(".");
  return frac && frac !== "0" ? `${int}.${frac.slice(0, 4)}` : int;
}

function safeTreasuryAvailable(chainId: number): boolean {
  try {
    return treasuryAvailable(chainId);
  } catch {
    return false;
  }
}

function safeStakingAvailable(chainId: number): boolean {
  try {
    return stakingAvailable(chainId);
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
