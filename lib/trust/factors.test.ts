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

/** Rebuild a TrustScore exactly the way lib/trust/score.ts does. */
function trust(signals: TrustSignals, adminAdjustment: number): TrustScore {
  const computed = clamp(
    (signals.isCitizen ? 20 : 0) +
      Math.min(20, Math.floor(signals.tenureBlocks / TENURE_BLOCKS_PER_POINT)) +
      Math.min(20, signals.referralsBecameCitizens * 4) +
      Math.min(20, signals.governanceVotes * 4) +
      Math.min(20, signals.dividendClaims * 4),
    0,
    100,
  );
  return {
    computed,
    adminAdjustment,
    finalScore: clamp(computed + adminAdjustment, 0, 100),
    signals,
  };
}

const sum = (t: TrustScore) => decomposeTrustScore(t).reduce((a, f) => a + f.points, 0);

const CASES: Array<{ name: string; signals: TrustSignals; adj: number }> = [
  {
    name: "zero everything",
    signals: {
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
      isCitizen: true,
      tenureBlocks: 10_000_000,
      referralsBecameCitizens: 9,
      governanceVotes: 9,
      dividendClaims: 9,
    },
    adj: 50,
  },
  {
    name: "negative adjustment clamped at 0",
    signals: {
      isCitizen: true,
      tenureBlocks: 0,
      referralsBecameCitizens: 0,
      governanceVotes: 0,
      dividendClaims: 0,
    },
    adj: -70,
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
    // computed 20 (citizen only) with -70 → finalScore 0; effective delta is -20.
    const t = trust(
      {
        isCitizen: true,
        tenureBlocks: 0,
        referralsBecameCitizens: 0,
        governanceVotes: 0,
        dividendClaims: 0,
      },
      -70,
    );
    const adj = decomposeTrustScore(t).find((f) => f.key === "cabinet-adjustment");
    expect(adj?.points).toBe(-20);
    expect(adj?.detail).toMatch(/clamped/i);
    expect(adj?.detail).toMatch(/-70/);
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
