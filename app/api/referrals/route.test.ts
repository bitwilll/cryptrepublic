// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

/**
 * POST /api/referrals (Wave 12 B3). The gate + chain reads are mocked; users +
 * referrals + token balance are real prisma. Asserts the create-route
 * contract: self-referral / unknown-email / existing-citizen / gate-denied /
 * duplicate → 400; a trust-bypass create keeps the balance; a token create
 * decrements exactly one; bad origin → 403; unauthenticated → 401.
 */

const h = vi.hoisted(() => ({
  allowed: true,
  viaToken: false,
  reason: "",
  referredIsCitizen: false,
  referredAddress: null as string | null,
}));

vi.mock("@/lib/referrals/gate", () => ({
  canCreateReferral: async () => ({
    allowed: h.allowed,
    viaToken: h.viaToken,
    reason: h.reason,
    finalScore: 0,
    tokenBalance: 0,
  }),
}));
vi.mock("@/lib/passport/serverReads", () => ({
  readHasPassportServer: async () => h.referredIsCitizen,
}));
vi.mock("@/lib/applications/applicant", () => ({
  resolveApplicantAddress: async () => h.referredAddress,
}));

import { POST } from "./route";

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const referrerEmail = `ref-r-${suffix}@w12ref.example`;
const referredEmail = `ref-e-${suffix}@w12ref.example`;

let referrerId: string;
let referredId: string;
let token: string;

function post(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(APP + "/api/referrals", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const referrer = await prisma.user.create({
    data: { email: referrerEmail, referralTokenBalance: 3 },
  });
  const referred = await prisma.user.create({ data: { email: referredEmail } });
  referrerId = referrer.id;
  referredId = referred.id;
  ({ token } = await createSession(referrerId));
});

beforeEach(async () => {
  h.allowed = true;
  h.viaToken = false;
  h.reason = "";
  h.referredIsCitizen = false;
  h.referredAddress = null;
  await prisma.referral.deleteMany({ where: { referrerUserId: referrerId } });
  await prisma.user.update({ where: { id: referrerId }, data: { referralTokenBalance: 3 } });
});

afterAll(async () => {
  await prisma.referral.deleteMany({ where: { referrerUserId: referrerId } });
  await prisma.user.deleteMany({ where: { id: { in: [referrerId, referredId] } } });
  await prisma.$disconnect();
});

describe("POST /api/referrals", () => {
  it("403 on a foreign origin", async () => {
    const res = await POST(post({ referredEmail }, { token, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await POST(post({ referredEmail }))).status).toBe(401);
  });

  it("400 on a bad body (unknown key / not an email)", async () => {
    expect((await POST(post({ zz: 1 }, { token }))).status).toBe(400);
    expect((await POST(post({ referredEmail: "not-an-email" }, { token }))).status).toBe(400);
  });

  it("400 for an unknown email", async () => {
    const res = await POST(post({ referredEmail: `nobody-${suffix}@x.co` }, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no such user/i);
  });

  it("400 on self-referral", async () => {
    const res = await POST(post({ referredEmail: referrerEmail }, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/yourself/i);
  });

  it("400 when the referred user is already an on-chain citizen", async () => {
    h.referredAddress = "0x00000000000000000000000000000000000000A1";
    h.referredIsCitizen = true;
    const res = await POST(post({ referredEmail }, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already a citizen/i);
  });

  it("400 when the gate denies (no token, low trust)", async () => {
    h.allowed = false;
    h.reason = "You need a referral token or a trust score above 50 to refer someone.";
    const res = await POST(post({ referredEmail }, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/referral token or a trust score/i);
  });

  it("trust-bypass create → 200, a Referral(whenTokenConsumed:false), balance UNCHANGED", async () => {
    h.allowed = true;
    h.viaToken = false;
    const res = await POST(post({ referredEmail }, { token }));
    expect(res.status).toBe(200);
    const row = await prisma.referral.findFirst({
      where: { referrerUserId: referrerId, referredUserId: referredId },
    });
    expect(row?.whenTokenConsumed).toBe(false);
    const u = await prisma.user.findUnique({ where: { id: referrerId } });
    expect(u?.referralTokenBalance).toBe(3); // unchanged
  });

  it("token create → 200, a Referral(whenTokenConsumed:true), balance decremented by exactly 1", async () => {
    h.allowed = true;
    h.viaToken = true;
    const res = await POST(post({ referredEmail }, { token }));
    expect(res.status).toBe(200);
    const row = await prisma.referral.findFirst({
      where: { referrerUserId: referrerId, referredUserId: referredId },
    });
    expect(row?.whenTokenConsumed).toBe(true);
    const u = await prisma.user.findUnique({ where: { id: referrerId } });
    expect(u?.referralTokenBalance).toBe(2); // 3 → 2
  });

  it("duplicate referral → 400 'already referred'", async () => {
    h.allowed = true;
    h.viaToken = false;
    expect((await POST(post({ referredEmail }, { token }))).status).toBe(200);
    const dup = await POST(post({ referredEmail }, { token }));
    expect(dup.status).toBe(400);
    expect((await dup.json()).error).toMatch(/already referred/i);
  });
});
