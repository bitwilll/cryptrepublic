"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCitizen } from "@/components/shell/SessionCitizenProvider";
import { useChainInfo } from "@/lib/hooks/useChainInfo";
import { Ledger } from "@/components/ui/Ledger";

/**
 * Citizen home (§7.5) client island. Every figure is REAL or honestly empty:
 * the salutation block comes from `useChainInfo()` (never "21 408 932"); the
 * obligations list from `/api/citizen/obligations` (0 obligations honestly on a
 * fresh chain, or a single "Mint your passport" for a non-citizen); the ledger
 * from `/api/stats/activity` (block-sorted, empty on a fresh chain — never the
 * mockup's 6 demo rows). Each card degrades gracefully with a per-card retry.
 */

interface Obligation {
  kind: string;
  ref: string;
  label: string;
}
interface Activity extends Record<string, unknown> {
  kind: string;
  blockNumber: string;
  ref: string;
}

type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

export function CitizenHomeApp() {
  const { isCitizen } = useCitizen();
  const chain = useChainInfo();

  const [obligations, setObligations] = useState<Load<Obligation[]>>({ status: "loading" });
  const [activity, setActivity] = useState<Load<Activity[]>>({ status: "loading" });
  const [totalCitizens, setTotalCitizens] = useState<number | null>(null);

  const loadObligations = useCallback(() => {
    setObligations({ status: "loading" });
    fetch("/api/citizen/obligations")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { obligations?: Obligation[] }) =>
        setObligations({ status: "ok", data: Array.isArray(d.obligations) ? d.obligations : [] }),
      )
      .catch(() => setObligations({ status: "error" }));
  }, []);

  const loadActivity = useCallback(() => {
    setActivity({ status: "loading" });
    fetch("/api/stats/activity")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { activity?: Activity[] }) =>
        setActivity({ status: "ok", data: Array.isArray(d.activity) ? d.activity : [] }),
      )
      .catch(() => setActivity({ status: "error" }));
  }, []);

  useEffect(() => {
    loadObligations();
    loadActivity();
    fetch("/api/stats/summary")
      .then((r) => (r.ok ? r.json() : { totalCitizens: null }))
      .then((d: { totalCitizens?: string | null }) =>
        setTotalCitizens(d.totalCitizens != null ? Number(d.totalCitizens) : null),
      )
      .catch(() => setTotalCitizens(null));
  }, [loadObligations, loadActivity]);

  const blockLabel = chain.blockNumber != null ? chain.blockNumber.toString() : "—";

  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">CITIZEN CONSOLE</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: 24,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          <Salutation isCitizen={isCitizen} blockLabel={blockLabel} chainName={chain.chainName} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <StatRow
              label="STANDING"
              value={<span style={{ fontSize: 18 }}>{isCitizen ? "Active" : "Applicant"}</span>}
            />
            <StatRow
              label="OBLIGATIONS"
              value={obligations.status === "ok" ? obligations.data.length : "—"}
            />
            <StatRow label="CENSUS" value={totalCitizens != null ? totalCitizens : "—"} />
          </div>
          <ObligationsCard state={obligations} isCitizen={isCitizen} onRetry={loadObligations} />
          <RepublicLedger
            state={activity}
            explorerBase={chain.explorerBase}
            onRetry={loadActivity}
          />
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <PassportRailCard
            isCitizen={isCitizen}
            pendingKind={
              obligations.status === "ok"
                ? // The admin-approved state wins over the witness path (Wave 10 A5).
                  (obligations.data.find((o) => o.kind === "admin-approved")?.kind ??
                  obligations.data.find((o) => o.kind === "witness")?.kind ??
                  null)
                : null
            }
          />
          <CensusTickerCard total={totalCitizens} />
        </aside>
      </div>
    </div>
  );
}

function Salutation({
  isCitizen,
  blockLabel,
  chainName,
}: {
  isCitizen: boolean;
  blockLabel: string;
  chainName: string;
}) {
  return (
    <article className="pillar" data-testid="salutation" style={{ padding: "28px 30px" }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          letterSpacing: "0.12em",
          fontWeight: 700,
          fontFamily: "var(--mono)",
        }}
      >
        SALUTATION · {chainName} · BLOCK {blockLabel}
      </div>
      <h1 style={{ marginTop: 10, fontSize: 34 }}>
        {isCitizen ? "Welcome back, Citizen." : "Welcome, applicant."}
      </h1>
      <p style={{ color: "var(--muted)", marginTop: 12, maxWidth: 560, lineHeight: 1.55 }}>
        {isCitizen
          ? "Your standing in the Republic is active. Your outstanding obligations are below."
          : "You are not yet a citizen. Mint your soulbound passport to vote, claim dividends, and take your place in the census."}
      </p>
    </article>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="pillar" style={{ padding: 16 }}>
      <div
        style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, fontFamily: "var(--mono)" }}>
        {value}
      </div>
    </div>
  );
}

function ObligationsCard({
  state,
  isCitizen,
  onRetry,
}: {
  state: Load<Obligation[]>;
  isCitizen: boolean;
  onRetry: () => void;
}) {
  return (
    <article className="pillar" data-testid="obligations" style={{ padding: "24px 28px" }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>Your obligations</h3>
      {state.status === "loading" && <Skeleton lines={3} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="obligations-error" />}
      {state.status === "ok" && (
        <>
          {!isCitizen && state.data.some((o) => MINT_PENDING_KINDS.includes(o.kind)) ? (
            // An in-flight mint (witness/seal stage OR admin-approved — Wave 10
            // addendum #6): show the waiting state and RESUME the saved flow —
            // never a "start a new mint" affordance.
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {state.data
                .filter((o) => MINT_PENDING_KINDS.includes(o.kind))
                .map((o) => (
                  <div
                    key={`${o.kind}-${o.ref}`}
                    data-testid={
                      o.kind === "admin-approved" ? "admin-approved-pending" : "witness-pending"
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "12px 14px",
                      background: "var(--paper)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    <div style={{ flex: 1, fontWeight: 500 }}>{o.label}</div>
                    <Link
                      className="btn"
                      href="/dashboard/mint"
                      style={{ padding: "8px 16px", fontSize: 12 }}
                    >
                      RESUME →
                    </Link>
                  </div>
                ))}
            </div>
          ) : !isCitizen ? (
            <div
              style={{
                marginTop: 16,
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 14px",
                background: "var(--paper)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ flex: 1, fontWeight: 500 }}>
                Mint your passport to take part in the Republic.
              </div>
              <Link
                className="btn btn-primary"
                href="/dashboard/mint"
                style={{ padding: "8px 16px" }}
              >
                Mint your passport →
              </Link>
            </div>
          ) : state.data.length === 0 ? (
            <p data-testid="obligations-empty" style={{ color: "var(--muted)", marginTop: 14 }}>
              You have no outstanding obligations. The Republic rests easy.
            </p>
          ) : (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {state.data.map((o) => (
                <div
                  key={`${o.kind}-${o.ref}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 14px",
                    background: "var(--paper)",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div style={{ flex: 1, fontWeight: 500 }}>{o.label}</div>
                  <Link
                    href={obligationHref(o.kind)}
                    className="btn"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                  >
                    OPEN →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

/** Obligation kinds that mean "a mint is pending" (Wave 10: admin-approved counts). */
const MINT_PENDING_KINDS = ["witness", "admin-approved"];

function obligationHref(kind: string): string {
  switch (kind) {
    case "vote":
      return "/dashboard/governance";
    case "dividend":
    case "claim":
      return "/dashboard/holdings";
    case "witness":
      return "/dashboard/witness";
    default:
      return "/dashboard";
  }
}

function RepublicLedger({
  state,
  explorerBase,
  onRetry,
}: {
  state: Load<Activity[]>;
  explorerBase: string | null;
  onRetry: () => void;
}) {
  return (
    <article className="pillar" style={{ padding: "24px 28px" }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>The ledger of the Republic</h3>
      <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 13 }}>Ordered by block</p>
      {state.status === "loading" && <Skeleton lines={4} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="ledger-error" />}
      {state.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <Ledger
            columns={[
              { key: "kind", label: "Event" },
              { key: "ref", label: "Ref" },
              { key: "blockNumber", label: "Block", align: "right" },
            ]}
            rows={state.data}
            getRowKey={(r, i) => `${r.kind}-${r.ref}-${i}`}
            empty="No Republic activity yet."
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

function PassportRailCard({
  isCitizen,
  pendingKind,
}: {
  isCitizen: boolean;
  pendingKind: string | null;
}) {
  if (!isCitizen && pendingKind) {
    // In-flight mint (witness/seal stage OR admin-approved) — no "start a new
    // mint" wording. The admin-approved copy is chain-truth honest: approved,
    // being issued — never "citizen" until the chain confirms.
    return (
      <article className="pillar" style={{ padding: 20 }} data-testid="passport-rail-pending">
        <div
          style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
        >
          YOUR PASSPORT
        </div>
        <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 13 }}>
          {pendingKind === "admin-approved"
            ? "Approved by an administrator — your passport is being issued by the Republic."
            : "Passport mint in progress — waiting for witness attestations."}
        </p>
        <Link className="btn" href="/dashboard/mint" style={{ marginTop: 14, width: "100%" }}>
          RESUME →
        </Link>
      </article>
    );
  }
  return (
    <article className="pillar" style={{ padding: 20 }}>
      <div
        style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        YOUR PASSPORT
      </div>
      {isCitizen ? (
        <>
          <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 13 }}>
            Your soulbound credential is sealed on chain.
          </p>
          <Link
            className="btn btn-primary"
            href="/dashboard/passport"
            style={{ marginTop: 14, width: "100%" }}
          >
            View credential →
          </Link>
        </>
      ) : (
        <>
          <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 13 }}>
            You have not minted a passport yet.
          </p>
          <Link
            className="btn btn-primary"
            href="/dashboard/mint"
            style={{ marginTop: 14, width: "100%" }}
          >
            Mint your passport →
          </Link>
        </>
      )}
    </article>
  );
}

function CensusTickerCard({ total }: { total: number | null }) {
  return (
    <article className="pillar" style={{ padding: 20 }}>
      <div
        style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        CENSUS · LIVE
      </div>
      <div
        data-testid="census-count"
        style={{
          marginTop: 12,
          fontFamily: "var(--mono)",
          fontSize: 26,
          fontWeight: 700,
          color: "var(--gold)",
        }}
      >
        {total != null ? total.toLocaleString("en-US").replace(/,/g, " ") : "—"}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
        citizens (live · totalCitizens)
      </div>
    </article>
  );
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
