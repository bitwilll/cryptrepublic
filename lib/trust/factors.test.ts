// @vitest-environment node
import { describe, it, expect } from "vitest";
import { decomposeTrustScore, buildTrustReport, REFERRAL_GATE_THRESHOLD } from "./factors";
import { TENURE_BLOCKS_PER_POINT, type TrustScore, type TrustSignals } from "./score";

/**
 * Factor decomposition (Wave 15 — Identity). The ledger is a FAITHFUL
 * decomposition of computeTrustScore: six factors (five bounded sub-scores +
 * the effective Cabinet adjustment) whose sum ALWAYS equals finalScore —
 * including when the clamp absorbs part of the adjustment.
 */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Rebuild a TrustScore exactly the way lib/trust/score.ts does (Wave 17 math). */
function trust(signals: TrustSignals, adminAdjustment: number): TrustScore {
  const civic = Math.min(
    10,
    signals.witnessAttestationsGiven * 2 +
      signals.certificatesIssued +
      signals.projectEndorsementsGiven,
  );
  const computed = clamp(
    (signals.isCitizen ? 20 : 0) +
      Math.min(20, Math.floor(signals.tenureBlocks / TENURE_BLOCKS_PER_POINT)) +
      Math.min(20, signals.referralsBecameCitizens * 4) +
      Math.min(20, signals.governanceVotes * 4) +
      Math.min(20, signals.dividendClaims * 4) +
      civic,
    0,
    100,
  );
  return {
    computed,
    adminAdjustment,
    finalScore: clamp(computed + adminAdjustment + signals.penalPoints, -100, 100),
    signals,
  };
}

const sum = (t: TrustScore) => decomposeTrustScore(t).reduce((a, f) => a + f.points, 0);

const CIVIC_ZERO = {
  witnessAttestationsGiven: 0,
  certificatesIssued: 0,
  projectEndorsementsGiven: 0,
  penalPoints: 0,
  verifiedReportCount: 0,
};

const CASES: Array<{ name: string; signals: TrustSignals; adj: number }> = [
  {
    name: "zero everything",
    signals: {
      ...CIVIC_ZERO,
      isCitizen: false,
      tenureBlocks: 0,
      referralsBecameCitizens: 0,
      governanceVotes: 0,
      dividendClaims: 0,
    },
    adj: 0,
  },
  {
    name: "maxed citizen",
    signals: {
      ...CIVIC_ZERO,
      isCitizen: true,
      tenureBlocks: 10_000_000,
      referralsBecameCitizens: 9,
      governanceVotes: 9,
      dividendClaims: 9,
    },
    adj: 0,
  },
  {
    name: "partial signals",
    signals: {
      ...CIVIC_ZERO,
      isCitizen: true,
      tenureBlocks: TENURE_BLOCKS_PER_POINT * 3 + 17,
      referralsBecameCitizens: 2,
      governanceVotes: 3,
      dividendClaims: 1,
    },
    adj: 0,
  },
  {
    name: "positive adjustment, unclamped",
    signals: {
      ...CIVIC_ZERO,
      isCitizen: false,
      tenureBlocks: 0,
      referralsBecameCitizens: 1,
      governanceVotes: 0,
      dividendClaims: 0,
    },
    adj: 30,
  },
  {
    name: "positive adjustment clamped at 100",
    signals: {
      ...CIVIC_ZERO,
      isCitizen: true,
      tenureBlocks: 10_000_000,
      referralsBecameCitizens: 9,
      governanceVotes: 9,
      dividendClaims: 9,
    },
    adj: 50,
  },
  {
    name: "negative adjustment below zero (statute: negative standing)",
    signals: {
      ...CIVIC_ZERO,
      isCitizen: true,
      tenureBlocks: 0,
      referralsBecameCitizens: 0,
      governanceVotes: 0,
      dividendClaims: 0,
    },
    adj: -70,
  },
  {
    name: "civic activity capped at 10 inside the 100 band",
    signals: {
      ...CIVIC_ZERO,
      isCitizen: true,
      tenureBlocks: 0,
      referralsBecameCitizens: 0,
      governanceVotes: 0,
      dividendClaims: 0,
      witnessAttestationsGiven: 4,
      certificatesIssued: 5,
      projectEndorsementsGiven: 2,
    },
    adj: 0,
  },
  {
    name: "civic overflow absorbed when chain factors already reach 100",
    signals: {
      ...CIVIC_ZERO,
      isCitizen: true,
      tenureBlocks: 10_000_000,
      referralsBecameCitizens: 9,
      governanceVotes: 9,
      dividendClaims: 9,
      witnessAttestationsGiven: 3,
    },
    adj: 0,
  },
  {
    name: "penal record drives standing negative",
    signals: {
      ...CIVIC_ZERO,
      isCitizen: true,
      tenureBlocks: 0,
      referralsBecameCitizens: 0,
      governanceVotes: 0,
      dividendClaims: 0,
      penalPoints: -60,
      verifiedReportCount: 1,
    },
    adj: 0,
  },
  {
    name: "penal floor absorbs beyond -100",
    signals: {
      ...CIVIC_ZERO,
      isCitizen: false,
      tenureBlocks: 0,
      referralsBecameCitizens: 0,
      governanceVotes: 0,
      dividendClaims: 0,
      penalPoints: -160,
      verifiedReportCount: 3,
    },
    adj: -20,
  },
];

describe("decomposeTrustScore", () => {
  for (const c of CASES) {
    it(`factor sum equals finalScore — ${c.name}`, () => {
      const t = trust(c.signals, c.adj);
      expect(sum(t)).toBe(t.finalScore);
    });
  }

  it("reproduces each bounded sub-score exactly", () => {
    const t = trust(
      {
        ...CIVIC_ZERO,
        isCitizen: true,
        tenureBlocks: TENURE_BLOCKS_PER_POINT * 7,
        referralsBecameCitizens: 2,
        governanceVotes: 6, // 24 → capped 20
        dividendClaims: 1,
      },
      0,
    );
    const byKey = Object.fromEntries(decomposeTrustScore(t).map((f) => [f.key, f.points]));
    expect(byKey["sealed-passport"]).toBe(20);
    expect(byKey["tenure"]).toBe(7);
    expect(byKey["referrals"]).toBe(8);
    expect(byKey["governance"]).toBe(20); // capped
    expect(byKey["dividends"]).toBe(4);
    expect(byKey["cabinet-adjustment"]).toBe(0);
  });

  it("reports the EFFECTIVE adjustment when the clamp absorbs part of it", () => {
    // computed 20 (citizen only) with -130 → finalScore floors at -100; the
    // effective delta the band let through is -120 (10 absorbed by the floor).
    const t = trust(
      {
        ...CIVIC_ZERO,
        isCitizen: true,
        tenureBlocks: 0,
        referralsBecameCitizens: 0,
        governanceVotes: 0,
        dividendClaims: 0,
      },
      -130,
    );
    const adj = decomposeTrustScore(t).find((f) => f.key === "cabinet-adjustment");
    expect(adj?.points).toBe(-120);
    expect(adj?.detail).toMatch(/clamped/i);
    expect(adj?.detail).toMatch(/-130/);
  });

  it("every factor carries a label and a human detail", () => {
    const t = trust(CASES[0].signals, 0);
    for (const f of decomposeTrustScore(t)) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("buildTrustReport", () => {
  it("surfaces the gate threshold, gate state, and the statute text", () => {
    const above = buildTrustReport(
      trust(
        {
          ...CIVIC_ZERO,
          isCitizen: true,
          tenureBlocks: 10_000_000,
          referralsBecameCitizens: 9,
          governanceVotes: 9,
          dividendClaims: 9,
        },
        0,
      ),
    );
    expect(above.score).toBe(100);
    expect(above.thresholds.referralGate).toBe(REFERRAL_GATE_THRESHOLD);
    expect(above.referralGatePassed).toBe(true);
    expect(above.negativeStandingRule).toMatch(/verified dispute or convicted felony/i);
  });

  it("exactly 50 does NOT pass the gate (mirrors lib/referrals/gate.ts)", () => {
    // citizen(20) + tenure(20) + referrals(8) + governance(2*... ) → build exactly 50:
    // 20 + 20 + 8 + 0 + 0 = 48, +2 adjustment = 50.
    const t = trust(
      {
        ...CIVIC_ZERO,
        isCitizen: true,
        tenureBlocks: TENURE_BLOCKS_PER_POINT * 20,
        referralsBecameCitizens: 2,
        governanceVotes: 0,
        dividendClaims: 0,
      },
      2,
    );
    const report = buildTrustReport(t);
    expect(report.score).toBe(50);
    expect(report.referralGatePassed).toBe(false);
  });
});
