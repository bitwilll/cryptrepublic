"use client";
import { useCallback, useEffect, useState } from "react";
import { useChainInfo } from "@/lib/hooks/useChainInfo";
import { Ledger } from "@/components/ui/Ledger";

/**
 * Population / census (§7.11) client island — READ-ONLY, public (fully viewable
 * by not-yet-citizens). The hero total is the TRUSTLESS live `totalCitizens()`
 * (addendum #1: NEVER totalSupply()/a hardcoded 48 392). Per-city counts come
 * from live self-declared domicile aggregation (minted citizens only); the
 * seeded snapshot is shown only as demonstrative geography behind a SEEDED tag
 * and is NEVER merged into the live total. Recent inductions read from
 * CitizenMinted logs (empty on a fresh chain).
 */

interface City {
  code: string;
  name: string;
  lat: number;
  long: number;
  hasEmbassy: boolean;
  liveCount: number;
  seededCount: number;
}
interface Induction extends Record<string, unknown> {
  tokenId: string;
  mintBlock: string;
  blockNumber: string;
}

type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

export function PopulationApp() {
  const chain = useChainInfo();
  const [census, setCensus] = useState<Load<{ totalCitizens: string | null; cities: City[] }>>({
    status: "loading",
  });
  const [delta24h, setDelta24h] = useState<number>(0);
  const [inductions, setInductions] = useState<Load<Induction[]>>({ status: "loading" });

  const loadCensus = useCallback(() => {
    setCensus({ status: "loading" });
    fetch("/api/population/census")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { totalCitizens: string | null; cities?: City[] }) =>
        setCensus({
          status: "ok",
          data: { totalCitizens: d.totalCitizens, cities: Array.isArray(d.cities) ? d.cities : [] },
        }),
      )
      .catch(() => setCensus({ status: "error" }));
  }, []);

  const loadInductions = useCallback(() => {
    setInductions({ status: "loading" });
    fetch("/api/stats/inductions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { inductions?: Induction[] }) =>
        setInductions({ status: "ok", data: Array.isArray(d.inductions) ? d.inductions : [] }),
      )
      .catch(() => setInductions({ status: "error" }));
  }, []);

  useEffect(() => {
    loadCensus();
    loadInductions();
    fetch("/api/stats/census")
      .then((r) => (r.ok ? r.json() : { delta24h: 0 }))
      .then((d: { delta24h?: number }) =>
        setDelta24h(typeof d.delta24h === "number" ? d.delta24h : 0),
      )
      .catch(() => setDelta24h(0));
  }, [loadCensus, loadInductions]);

  const cities = census.status === "ok" ? census.data.cities : [];
  const total = census.status === "ok" ? census.data.totalCitizens : null;

  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">POPULATION</div>

      <CensusHero total={total} delta24h={delta24h} state={census} onRetry={loadCensus} />
      <WorldMap cities={cities} />
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}
      >
        <TopCitiesCard cities={cities} />
        <RecentInductionsCard
          state={inductions}
          explorerBase={chain.explorerBase}
          onRetry={loadInductions}
        />
      </div>
    </div>
  );
}

function CensusHero({
  total,
  delta24h,
  state,
  onRetry,
}: {
  total: string | null;
  delta24h: number;
  state: Load<unknown>;
  onRetry: () => void;
}) {
  return (
    <article className="pillar" data-testid="census-hero" style={{ padding: "28px 32px" }}>
      <div
        style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em", fontWeight: 700 }}
      >
        LIVE CENSUS · totalCitizens()
      </div>
      {state.status === "loading" && <Skeleton lines={1} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="census-error" />}
      {state.status === "ok" && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "baseline",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              fontFamily: "var(--mono)",
            }}
          >
            {total != null ? Number(total).toLocaleString("en-US").replace(/,/g, " ") : "—"}
          </span>
          <span
            style={{
              fontSize: 16,
              color: "var(--success)",
              fontWeight: 700,
              fontFamily: "var(--mono)",
            }}
          >
            +{delta24h} / 24h
          </span>
        </div>
      )}
      <p style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
        The trustless live count of citizens, read from chain. Per-city figures below are
        self-declared or demonstrative and are never merged into this total.
      </p>
    </article>
  );
}

/** Rough equirectangular projection: lon/lat → x/y in an 800×420 viewBox. */
function project(lat: number, long: number): { x: number; y: number } {
  const x = ((long + 180) / 360) * 800;
  const y = ((90 - lat) / 180) * 420;
  return { x, y };
}

function WorldMap({ cities }: { cities: City[] }) {
  return (
    <article className="pillar" style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>The Republic on earth</h3>
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
          PINS SEEDED · GEOGRAPHY ONLY
        </span>
      </div>
      <svg
        data-testid="world-map"
        viewBox="0 0 800 420"
        width="100%"
        style={{ marginTop: 16, display: "block" }}
      >
        <defs>
          <pattern id="dotmap" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="0.7" fill="var(--muted)" opacity="0.3" />
          </pattern>
        </defs>
        <rect width="800" height="420" fill="var(--paper)" />
        <rect width="800" height="420" fill="url(#dotmap)" />
        {cities.map((c) => {
          const { x, y } = project(c.lat, c.long);
          // Radius scaled from the seeded snapshot (demonstrative geography only).
          const r = Math.max(4, Math.min(18, Math.sqrt(c.seededCount) / 18));
          return (
            <g key={c.code} data-testid="map-pin">
              <circle
                cx={x}
                cy={y}
                r={r + 4}
                fill={c.hasEmbassy ? "var(--gold)" : "var(--muted)"}
                opacity="0.15"
              />
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={c.hasEmbassy ? "var(--gold)" : "var(--muted)"}
                opacity="0.8"
              />
              <text
                x={x + r + 6}
                y={y + 3}
                fontSize="10"
                fill="var(--ink)"
                fontFamily="var(--mono)"
                fontWeight="700"
              >
                {c.code}
              </text>
            </g>
          );
        })}
      </svg>
    </article>
  );
}

function TopCitiesCard({ cities }: { cities: City[] }) {
  const sorted = [...cities].sort((a, b) => b.seededCount - a.seededCount).slice(0, 8);
  const max = sorted[0]?.seededCount ?? 1;
  return (
    <article className="pillar" data-testid="top-cities" style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Top cities</h3>
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
          SEEDED SNAPSHOT
        </span>
      </div>
      {sorted.length === 0 ? (
        <p style={{ color: "var(--muted)", marginTop: 14, fontSize: 13 }}>
          No cities recorded yet.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {sorted.map((c) => (
            <div
              key={c.code}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 150px",
                gap: 12,
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <div
                style={{
                  height: 8,
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(c.seededCount / max) * 100}%`,
                    height: "100%",
                    background: "var(--gold)",
                  }}
                />
              </div>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, textAlign: "right" }}>
                {c.seededCount.toLocaleString("en-US").replace(/,/g, " ")} · live {c.liveCount}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function RecentInductionsCard({
  state,
  explorerBase,
  onRetry,
}: {
  state: Load<Induction[]>;
  explorerBase: string | null;
  onRetry: () => void;
}) {
  return (
    <article className="pillar" data-testid="recent-inductions" style={{ padding: "24px 28px" }}>
      <h3 style={{ margin: 0, fontSize: 20 }}>Recent inductions</h3>
      <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 12 }}>
        From CitizenMinted events, newest first.
      </p>
      {state.status === "loading" && <Skeleton lines={3} />}
      {state.status === "error" && <CardError onRetry={onRetry} testid="inductions-error" />}
      {state.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <Ledger
            columns={[
              { key: "tokenId", label: "Citizen", render: (r) => `№${r.tokenId}` },
              { key: "mintBlock", label: "Mint block", align: "right" },
            ]}
            rows={state.data}
            getRowKey={(r) => r.tokenId}
            empty={<span data-testid="inductions-empty">No inductions yet.</span>}
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
