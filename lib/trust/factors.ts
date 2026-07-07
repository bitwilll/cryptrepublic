import { TENURE_BLOCKS_PER_POINT, type TrustScore } from "./score";

/**
 * Faithful DECOMPOSITION of the existing hybrid trust score (lib/trust/score.ts)
 * into a citizen-readable factor ledger (Wave 15 — Identity). This file invents
 * NO new scoring: every factor reproduces exactly one bounded sub-score of
 * `computeTrustScore` (each max 20), plus the Cabinet adjustment as its
 * EFFECTIVE (post-clamp) delta, so the factor sum ALWAYS equals `finalScore`.
 *
 * The referral gate (lib/referrals/gate.ts) frees a referral when
 * finalScore > 50 — exactly 50 is NOT a bypass; that threshold is surfaced
 * here so the UI and the gate can never drift apart.
 */

/** Mirrors TRUST_BYPASS_THRESHOLD in lib/referrals/gate.ts (finalScore > 50 refers free). */
export const REFERRAL_GATE_THRESHOLD = 50;

/** Statute text (Miro: trust score) — surfaced verbatim by /api/trust and the trust page. */
export const NEGATIVE_STANDING_RULE =
  "Upon verified dispute or convicted felony the score may go negative.";

const SUBSCORE_CAP = 20;
const POINTS_PER_EVENT = 4;

export interface TrustFactor {
  key: string;
  label: string;
  points: number;
  detail: string;
}

export interface TrustReport {
  score: number; // == finalScore of the existing computation
  computed: number;
  adminAdjustment: number;
  factors: TrustFactor[];
  thresholds: { referralGate: number };
  referralGatePassed: boolean; // score > threshold (mirrors the gate exactly)
  negativeStandingRule: string;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/**
 * Decompose a computed TrustScore into its real inputs. Invariant (unit-tested):
 * the sum of `points` over all factors equals `finalScore`.
 */
export function decomposeTrustScore(t: TrustScore): TrustFactor[] {
  const s = t.signals;
  const tenurePoints = Math.min(SUBSCORE_CAP, Math.floor(s.tenureBlocks / TENURE_BLOCKS_PER_POINT));
  const tenureDays = Math.floor(s.tenureBlocks / TENURE_BLOCKS_PER_POINT);
  const referralPoints = Math.min(SUBSCORE_CAP, s.referralsBecameCitizens * POINTS_PER_EVENT);
  const governancePoints = Math.min(SUBSCORE_CAP, s.governanceVotes * POINTS_PER_EVENT);
  const dividendPoints = Math.min(SUBSCORE_CAP, s.dividendClaims * POINTS_PER_EVENT);
  // The EFFECTIVE adjustment — what the clamp actually let through — so the
  // ledger never overstates a Cabinet delta the 0..100 band absorbed.
  const effectiveAdjustment = t.finalScore - t.computed;
  const clampNote =
    t.adminAdjustment !== 0 && effectiveAdjustment !== t.adminAdjustment
      ? ` (clamped to the 0–100 band from a recorded ${t.adminAdjustment > 0 ? "+" : ""}${t.adminAdjustment})`
      : "";

  return [
    {
      key: "sealed-passport",
      label: "Sealed passport",
      points: s.isCitizen ? SUBSCORE_CAP : 0,
      detail: s.isCitizen
        ? "A sealed passport is held on-chain — citizenship verified against the chain."
        : "No sealed passport on-chain yet. Sealing your passport is the single largest factor.",
    },
    {
      key: "tenure",
      label: "Citizenship tenure",
      points: tenurePoints,
      detail:
        s.tenureBlocks > 0
          ? `≈${plural(tenureDays, "day")} since your passport was sealed (${s.tenureBlocks.toLocaleString("en-US")} blocks; 1 point per ${TENURE_BLOCKS_PER_POINT.toLocaleString("en-US")} blocks, capped at ${SUBSCORE_CAP}).`
          : "Tenure accrues from the block your passport is sealed.",
    },
    {
      key: "referrals",
      label: "Referrals sealed",
      points: referralPoints,
      detail:
        s.referralsBecameCitizens > 0
          ? `${plural(s.referralsBecameCitizens, "referred member")} went on to seal a passport (${POINTS_PER_EVENT} points each, capped at ${SUBSCORE_CAP}).`
          : "No referred member has sealed a passport yet.",
    },
    {
      key: "governance",
      label: "Governance votes",
      points: governancePoints,
      detail:
        s.governanceVotes > 0
          ? `${plural(s.governanceVotes, "vote")} cast on ratified proposals (${POINTS_PER_EVENT} points each, capped at ${SUBSCORE_CAP}).`
          : "No governance votes on record.",
    },
    {
      key: "dividends",
      label: "Dividend claims",
      points: dividendPoints,
      detail:
        s.dividendClaims > 0
          ? `${plural(s.dividendClaims, "dividend claim")} recorded on-chain (${POINTS_PER_EVENT} points each, capped at ${SUBSCORE_CAP}).`
          : "No dividend claims on record.",
    },
    {
      key: "cabinet-adjustment",
      label: "Cabinet adjustment",
      points: effectiveAdjustment,
      detail:
        t.adminAdjustment === 0
          ? "No Cabinet adjustment on record."
          : `An audited, Cabinet-set adjustment of ${t.adminAdjustment > 0 ? "+" : ""}${t.adminAdjustment} points${clampNote}.`,
    },
  ];
}

/** Compose the full /api/trust payload from an already-computed TrustScore. */
export function buildTrustReport(t: TrustScore): TrustReport {
  return {
    score: t.finalScore,
    computed: t.computed,
    adminAdjustment: t.adminAdjustment,
    factors: decomposeTrustScore(t),
    thresholds: { referralGate: REFERRAL_GATE_THRESHOLD },
    referralGatePassed: t.finalScore > REFERRAL_GATE_THRESHOLD,
    negativeStandingRule: NEGATIVE_STANDING_RULE,
  };
}
