"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./trust.module.css";

/**
 * Trust score surface (Wave 15 — Identity; v2 Wave 17). Renders the caller's
 * hybrid trust score from GET /api/trust as an official ledger: a segmented
 * 0..100 meter (square cells — never a rounded gauge) with BOTH gold gate
 * ticks (50 — referral gate; 65 — referral links), the 8-factor decomposition
 * table (sum == score by construction), guidance, and the statute note. When
 * the Penal Code drives the score below zero the meter renders empty under a
 * NEGATIVE STANDING banner. READ-ONLY: the score is computed server-side from
 * chain-real signals; it is never citizenship.
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
  thresholds: { referralGate: number; referralLinkGate: number };
  referralGatePassed: boolean;
  referralLinkGatePassed: boolean;
  negativeStanding: boolean;
  negativeStandingRule: string;
}
type Load = { status: "loading" } | { status: "ok"; data: TrustPayload } | { status: "error" };

const SEGMENTS = 20; // 5 points per segment
const GUIDANCE = [
  "Seal your passport — citizenship is the single largest factor (20 points).",
  "Remain in good standing: tenure accrues automatically for every day since your seal (up to 20 points).",
  "Refer members who go on to seal a passport of their own (4 points each, up to 20).",
  "Vote on ratified proposals in Constitution & votes (4 points each, up to 20).",
  "Claim your citizen dividends when distributions open (4 points each, up to 20).",
  "Witness for applicants, issue certificates, and endorse projects (up to 10 points of civic activity).",
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
  const linkGate = d.thresholds.referralLinkGate;
  // Negative standing renders an EMPTY meter (the max(0, …) clamps it away).
  const filled = Math.round((Math.max(0, Math.min(100, d.score)) / 100) * SEGMENTS);
  const gateSegment = Math.floor((gate / 100) * SEGMENTS); // boundary AFTER this many segments
  const linkGateSegment = Math.floor((linkGate / 100) * SEGMENTS);

  return (
    <>
      <section className={styles.card} data-testid="trust-score-card">
        <h2 className={styles.microLabel}>Civic standing · computed on read · read-only</h2>
        <div className={styles.scoreRow}>
          <span
            className={`${styles.scoreValue} ${d.negativeStanding ? styles.scoreNegative : ""}`}
            data-testid="trust-score-value"
          >
            {d.score}
          </span>
          <span className={styles.scoreOutOf}>/ 100</span>
        </div>
        {d.negativeStanding && (
          <p className={styles.negativeBanner} role="alert" data-testid="trust-negative-banner">
            Negative standing — Penal Code
          </p>
        )}
        <div
          className={styles.meter}
          role="img"
          aria-label={`Trust score ${d.score} of 100. The referral gate sits at ${gate}; referral links unlock above ${linkGate}.`}
          data-testid="trust-meter"
        >
          {Array.from({ length: SEGMENTS }).map((_, i) => (
            <span
              key={i}
              className={[
                styles.segment,
                i < filled ? styles.segmentFilled : "",
                i === gateSegment || i === linkGateSegment ? styles.segmentGate : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          ))}
        </div>
        <div className={styles.meterScale} aria-hidden="true">
          <span>0</span>
          <span>100</span>
        </div>
        <div className={styles.gateScale} aria-hidden="true">
          <span className={styles.gateTickLabel} style={{ left: `${gate}%`, top: 0 }}>
            {gate} — referral gate
          </span>
          <span className={styles.gateTickLabel} style={{ left: `${linkGate}%`, top: 15 }}>
            {linkGate} — referral links
          </span>
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
        <p
          className={`${styles.gateLine} ${styles.gateLineTight} ${d.referralLinkGatePassed ? styles.gatePassed : styles.gateHeld}`}
          data-testid="trust-linkgate-line"
        >
          {d.referralLinkGatePassed
            ? `Standing above ${linkGate} — shareable referral links are unlocked.`
            : `Standing at or below ${linkGate} — shareable referral links stay locked.`}
        </p>
      </section>

      <section className={styles.card} data-testid="trust-factor-ledger">
        <h2 className={styles.microLabel}>Factor ledger · sum equals your score</h2>
        <div
          className={styles.tableWrap}
          role="region"
          aria-label="Factor ledger (scrolls horizontally on narrow screens)"
          tabIndex={0}
        >
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
        <h2 className={styles.microLabel}>What raises your standing</h2>
        <ul className={styles.guidance}>
          {GUIDANCE.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </section>

      <aside className={styles.statute} data-testid="trust-statute">
        Statute of standing: {d.negativeStandingRule} See the{" "}
        <Link href="/documents/penal-code">Penal code</Link> for the procedure of verified disputes.
      </aside>
    </>
  );
}
