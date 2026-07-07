"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./trust.module.css";

/**
 * Trust score surface (Wave 15 — Identity). Renders the caller's hybrid trust
 * score from GET /api/trust as an official ledger: a segmented 0..100 meter
 * (square cells — never a rounded gauge), the factor decomposition table
 * (sum == score by construction), guidance, and the statute note. READ-ONLY:
 * the score is computed server-side from chain-real signals; it is never
 * citizenship.
 */

interface TrustFactor {
  key: string;
  label: string;
  points: number;
  detail: string;
}
interface TrustPayload {
  score: number;
  computed: number;
  adminAdjustment: number;
  factors: TrustFactor[];
  thresholds: { referralGate: number };
  referralGatePassed: boolean;
  negativeStandingRule: string;
}
type Load =
  | { status: "loading" }
  | { status: "ok"; data: TrustPayload }
  | { status: "error" };

const SEGMENTS = 20; // 5 points per segment
const GUIDANCE = [
  "Seal your passport — citizenship is the single largest factor (20 points).",
  "Remain in good standing: tenure accrues automatically for every day since your seal (up to 20 points).",
  "Refer members who go on to seal a passport of their own (4 points each, up to 20).",
  "Vote on ratified proposals in Constitution & votes (4 points each, up to 20).",
  "Claim your citizen dividends when distributions open (4 points each, up to 20).",
] as const;

export function TrustApp(): React.ReactElement {
  const [state, setState] = useState<Load>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/trust", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: TrustPayload) => setState({ status: "ok", data: d }))
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <div className={styles.card} data-testid="trust-loading" aria-busy="true">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className={styles.card} data-testid="trust-error">
        <p className={styles.error} role="alert">
          Could not load your standing. The registry may be briefly unavailable.
        </p>
        <button type="button" className={styles.retry} onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  const d = state.data;
  const gate = d.thresholds.referralGate;
  const filled = Math.round((Math.max(0, Math.min(100, d.score)) / 100) * SEGMENTS);
  const gateSegment = Math.floor((gate / 100) * SEGMENTS); // boundary AFTER this many segments

  return (
    <>
      <section className={styles.card} data-testid="trust-score-card">
        <div className={styles.microLabel}>Civic standing · computed on read · read-only</div>
        <div className={styles.scoreRow}>
          <span className={styles.scoreValue} data-testid="trust-score-value">
            {d.score}
          </span>
          <span className={styles.scoreOutOf}>/ 100</span>
        </div>
        <div
          className={styles.meter}
          role="img"
          aria-label={`Trust score ${d.score} of 100. The referral gate sits at ${gate}.`}
          data-testid="trust-meter"
        >
          {Array.from({ length: SEGMENTS }).map((_, i) => (
            <span
              key={i}
              className={[
                styles.segment,
                i < filled ? styles.segmentFilled : "",
                i === gateSegment ? styles.segmentGate : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          ))}
        </div>
        <div className={styles.meterScale} aria-hidden="true">
          <span>0</span>
          <span>{gate} — referral gate</span>
          <span>100</span>
        </div>
        <p
          className={`${styles.gateLine} ${d.referralGatePassed ? styles.gatePassed : styles.gateHeld}`}
          aria-live="polite"
          data-testid="trust-gate-line"
        >
          {d.referralGatePassed
            ? `Standing above ${gate} — you may refer without a token.`
            : `Standing at or below ${gate} — a referral spends one referral token.`}
        </p>
      </section>

      <section className={styles.card} data-testid="trust-factor-ledger">
        <div className={styles.microLabel}>Factor ledger · sum equals your score</div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Factor</th>
                <th scope="col">Detail</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {d.factors.map((f) => (
                <tr key={f.key} data-testid="trust-factor-row">
                  <td className={styles.factorLabel}>{f.label}</td>
                  <td className={styles.factorDetail}>{f.detail}</td>
                  <td
                    className={[
                      styles.points,
                      f.points > 0
                        ? styles.pointsPositive
                        : f.points < 0
                          ? styles.pointsNegative
                          : styles.pointsZero,
                    ].join(" ")}
                  >
                    {f.points > 0 ? `+${f.points}` : `${f.points}`}
                  </td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td>Standing</td>
                <td />
                <td className={styles.points} data-testid="trust-factor-total">
                  {d.score}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.microLabel}>What raises your standing</div>
        <ul className={styles.guidance}>
          {GUIDANCE.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </section>

      <aside className={styles.statute} data-testid="trust-statute">
        Statute of standing: {d.negativeStandingRule} See the{" "}
        <Link href="/documents/penal-code">Penal code</Link> for the procedure of verified
        disputes.
      </aside>
    </>
  );
}
