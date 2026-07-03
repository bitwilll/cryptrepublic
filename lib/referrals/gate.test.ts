// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Referral create-gate (Wave 12 B2). allowed = (trust finalScore > 50) OR (a
 * referral token is available). A token is consumed ONLY when finalScore <= 50
 * (a trust>50 referrer refers for free). Exactly 50 is NOT a bypass. Read-only
 * — the route does the transactional decrement.
 */

const h = vi.hoisted(() => ({
  finalScore: 0,
  tokenBalance: 0,
}));

vi.mock("@/lib/trust/score", () => ({
  computeTrustScore: async () => ({
    computed: h.finalScore,
    adminAdjustment: 0,
    finalScore: h.finalScore,
    signals: {},
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: async () => ({ referralTokenBalance: h.tokenBalance, trustAdjustment: 0 }),
    },
  },
}));
vi.mock("@/lib/applications/applicant", () => ({
  resolveApplicantAddress: async () => "0x00000000000000000000000000000000000000A1",
}));
vi.mock("@/lib/passport/serverReads", () => ({
  readPassportStatusServer: async () => ({ isCitizen: true, tokenId: 7n }),
}));

import { canCreateReferral } from "./gate";

beforeEach(() => {
  h.finalScore = 0;
  h.tokenBalance = 0;
});

describe("canCreateReferral", () => {
  it("trust > 50 → allowed, FREE (no token consumed) even at balance 0", async () => {
    h.finalScore = 60;
    h.tokenBalance = 0;
    const r = await canCreateReferral(84532, "u1");
    expect(r.allowed).toBe(true);
    expect(r.viaToken).toBe(false);
    expect(r.finalScore).toBe(60);
  });

  it("trust 51 is a bypass (> 50 is exclusive of 50)", async () => {
    h.finalScore = 51;
    const r = await canCreateReferral(84532, "u1");
    expect(r.allowed).toBe(true);
    expect(r.viaToken).toBe(false);
  });

  it("trust exactly 50 with tokens → allowed via TOKEN (50 is NOT a bypass)", async () => {
    h.finalScore = 50;
    h.tokenBalance = 2;
    const r = await canCreateReferral(84532, "u1");
    expect(r.allowed).toBe(true);
    expect(r.viaToken).toBe(true);
    expect(r.tokenBalance).toBe(2);
  });

  it("trust <= 50 with NO tokens → denied with a clear reason", async () => {
    h.finalScore = 50;
    h.tokenBalance = 0;
    const r = await canCreateReferral(84532, "u1");
    expect(r.allowed).toBe(false);
    expect(r.viaToken).toBe(false);
    expect(r.reason).toMatch(/token|trust/i);
  });

  it("low trust with a token → allowed via token", async () => {
    h.finalScore = 40;
    h.tokenBalance = 1;
    const r = await canCreateReferral(84532, "u1");
    expect(r.allowed).toBe(true);
    expect(r.viaToken).toBe(true);
  });
});
