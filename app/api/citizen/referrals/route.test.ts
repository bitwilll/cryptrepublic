// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

/**
 * GET /api/citizen/referrals (Wave 12 D1). Trust + gate + chain reads mocked;
 * users + referrals real. Returns the caller's read-only trust score, token
 * balance, can-create + reason, and their referrals with chain-derived
 * becameCitizen. Unauthenticated → 401.
 */
const h = vi.hoisted(() => ({
  finalScore: 60,
  allowed: true,
  reason: "",
  becameCitizen: false,
}));

vi.mock("@/lib/trust/score", () => ({
  computeTrustScore: async () => ({
    computed: h.finalScore,
    adminAdjustment: 0,
    finalScore: h.finalScore,
    signals: {
      isCitizen: true,
      tenureBlocks: 0,
      referralsBecameCitizens: 0,
      governanceVotes: 0,
      dividendClaims: 0,
    },
  }),
}));
vi.mock("@/lib/referrals/gate", () => ({
  canCreateReferral: async () => ({
    allowed: h.allowed,
    viaToken: false,
    reason: h.reason,
    finalScore: h.finalScore,
    tokenBalance: 0,
  }),
}));
vi.mock("@/lib/passport/serverReads", () => ({
  readHasPassportServer: async () => h.becameCitizen,
  readPassportStatusServer: async () => ({ isCitizen: false, tokenId: null }),
}));
vi.mock("@/lib/applications/applicant", () => ({
  resolveApplicantAddress: async () => "0x00000000000000000000000000000000000000A1",
}));

import { GET } from "./route";

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let userId: string;
let referredId: string;
let token: string;

function get(t?: string) {
  return new Request(APP + "/api/citizen/referrals", {
    method: "GET",
    headers: t ? { cookie: `cr_session=${t}` } : {},
  });
}

describe("GET /api/citizen/referrals", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `cref-${suffix}@w12d1.example`, referralTokenBalance: 3, trustAdjustment: 0 },
    });
    const r = await prisma.user.create({ data: { email: `cref-r-${suffix}@w12d1.example` } });
    userId = u.id;
    referredId = r.id;
    ({ token } = await createSession(userId));
    await prisma.referral.create({
      data: { referrerUserId: userId, referredUserId: referredId, whenTokenConsumed: true },
    });
  });
  afterAll(async () => {
    await prisma.referral.deleteMany({ where: { referrerUserId: userId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, referredId] } } });
    await prisma.$disconnect();
  });

  it("401 without a session", async () => {
    expect((await GET(get())).status).toBe(401);
  });

  it("returns read-only trust + token balance + can-create + my referrals (chain-derived becameCitizen)", async () => {
    h.finalScore = 60;
    h.allowed = true;
    h.becameCitizen = true;
    const res = await GET(get(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trustScore).toBe(60);
    expect(body.referralTokenBalance).toBe(3);
    expect(body.canCreateReferral).toBe(true);
    expect(body.createReason).toBeNull();
    expect(body.referrals).toHaveLength(1);
    expect(body.referrals[0].becameCitizen).toBe(true);
  });

  it("surfaces the gate reason when the citizen cannot create a referral", async () => {
    h.allowed = false;
    h.reason = "You need a referral token or a trust score above 50 to refer someone.";
    const body = await (await GET(get(token))).json();
    expect(body.canCreateReferral).toBe(false);
    expect(body.createReason).toMatch(/referral token or a trust score/i);
  });
});
