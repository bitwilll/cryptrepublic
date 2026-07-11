// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

/**
 * GET /api/trust (Wave 15 — Identity). Chain reads are mocked (reference-test
 * pattern); users / linked wallets / referrals are REAL prisma rows so
 * resolveApplicantAddress and the referral sub-score run for real. Asserts:
 * 401 unauthenticated; the factor ledger decomposes the REAL score (sum ==
 * score); the referral sub-score counts seeded referrals; adminAdjustment
 * folds and clamps; thresholds + gate state + statute text are surfaced.
 */

const SUBJECT_ADDR = "0x1111111111111111111111111111111111111111";
const REFERRED_ADDR = "0x2222222222222222222222222222222222222222";

const h = vi.hoisted(() => ({
  // per-address citizenship (lowercased keys)
  passports: {} as Record<string, boolean>,
  tokenId: null as bigint | null,
  headBlock: 0n,
  mintBlock: 0n,
  proposalCount: 0n,
  myVote: 0,
  dividendClaims: [] as number[],
}));

vi.mock("@/lib/passport/serverReads", () => ({
  readHasPassportServer: async (_c: number, a: string) => h.passports[a.toLowerCase()] ?? false,
  readCitizenMintedLogsServer: async () =>
    h.tokenId == null
      ? []
      : [
          {
            tokenId: h.tokenId,
            citizen: "0x1111111111111111111111111111111111111111",
            mintBlock: h.mintBlock,
            blockNumber: h.mintBlock,
          },
        ],
  readHeadBlockServer: async () => h.headBlock,
  readPassportStatusServer: async () => ({ isCitizen: h.tokenId != null, tokenId: h.tokenId }),
}));
vi.mock("@/lib/governance/serverReads", () => ({
  readProposalCountServer: async () => h.proposalCount,
  readMyVoteServer: async () => h.myVote,
}));
vi.mock("@/lib/dividends/serverReads", () => ({
  readDividendHistoryServer: async () => h.dividendClaims,
}));

import { GET } from "./route";

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const subjectEmail = `trust-s-${suffix}@w15trust.example`;
const referredEmail = `trust-r-${suffix}@w15trust.example`;

let subjectId: string;
let referredId: string;
let token: string;

function get(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(APP + "/api/trust", { method: "GET", headers });
}

interface TrustPayload {
  score: number;
  computed: number;
  adminAdjustment: number;
  factors: Array<{ key: string; label: string; points: number; detail: string }>;
  thresholds: { referralGate: number };
  referralGatePassed: boolean;
  negativeStandingRule: string;
}

beforeAll(async () => {
  const subject = await prisma.user.create({ data: { email: subjectEmail } });
  const referred = await prisma.user.create({ data: { email: referredEmail } });
  subjectId = subject.id;
  referredId = referred.id;
  ({ token } = await createSession(subjectId));
});

beforeEach(async () => {
  h.passports = {};
  h.tokenId = null;
  h.headBlock = 0n;
  h.mintBlock = 0n;
  h.proposalCount = 0n;
  h.myVote = 0;
  h.dividendClaims = [];
  await prisma.referral.deleteMany({ where: { referrerUserId: subjectId } });
  await prisma.linkedWallet.deleteMany({ where: { userId: { in: [subjectId, referredId] } } });
  await prisma.user.update({ where: { id: subjectId }, data: { trustAdjustment: 0 } });
});

afterAll(async () => {
  await prisma.referral.deleteMany({ where: { referrerUserId: subjectId } });
  await prisma.linkedWallet.deleteMany({ where: { userId: { in: [subjectId, referredId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [subjectId, referredId] } } });
  await prisma.$disconnect();
});

async function linkWallet(userId: string, address: string) {
  await prisma.linkedWallet.create({
    data: { userId, address, chain: "EVM", verifiedAt: new Date() },
  });
}

describe("GET /api/trust", () => {
  it("401 without a session", async () => {
    expect((await GET(get())).status).toBe(401);
  });

  it("a walletless member scores 0 with a full eight-factor ledger summing to the score", async () => {
    const res = await GET(get({ token }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as TrustPayload;
    expect(body.score).toBe(0);
    expect(body.factors).toHaveLength(8);
    expect(body.factors.reduce((a, f) => a + f.points, 0)).toBe(body.score);
    expect(body.thresholds.referralGate).toBe(50);
    expect(body.referralGatePassed).toBe(false);
    expect(body.negativeStandingRule).toMatch(/verified dispute or convicted felony/i);
  });

  it("a citizen's real signals decompose into the ledger (sum == score)", async () => {
    await linkWallet(subjectId, SUBJECT_ADDR);
    h.passports[SUBJECT_ADDR.toLowerCase()] = true;
    h.tokenId = 7n;
    h.mintBlock = 0n;
    h.headBlock = 43_200n * 3n; // 3 tenure points
    h.proposalCount = 2n;
    h.myVote = 1; // 2 votes → 8 points
    h.dividendClaims = [1]; // 1 claim → 4 points

    const res = await GET(get({ token }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as TrustPayload;
    const byKey = Object.fromEntries(body.factors.map((f) => [f.key, f.points]));
    expect(byKey["sealed-passport"]).toBe(20);
    expect(byKey["tenure"]).toBe(3);
    expect(byKey["governance"]).toBe(8);
    expect(byKey["dividends"]).toBe(4);
    expect(byKey["referrals"]).toBe(0);
    expect(body.score).toBe(35);
    expect(body.factors.reduce((a, f) => a + f.points, 0)).toBe(body.score);
    expect(body.referralGatePassed).toBe(false);
  });

  it("a seeded referral who became a citizen scores 4 referral points", async () => {
    await prisma.referral.create({
      data: { referrerUserId: subjectId, referredUserId: referredId, whenTokenConsumed: false },
    });
    await linkWallet(referredId, REFERRED_ADDR);
    h.passports[REFERRED_ADDR.toLowerCase()] = true;

    const res = await GET(get({ token }));
    const body = (await res.json()) as TrustPayload;
    const referrals = body.factors.find((f) => f.key === "referrals");
    expect(referrals?.points).toBe(4);
    expect(referrals?.detail).toMatch(/1 referred member/);
    expect(body.score).toBe(4);
  });

  it("adminAdjustment folds into the score and passes the gate above 50", async () => {
    await prisma.user.update({ where: { id: subjectId }, data: { trustAdjustment: 60 } });
    const res = await GET(get({ token }));
    const body = (await res.json()) as TrustPayload;
    expect(body.score).toBe(60); // 0 computed + 60
    expect(body.adminAdjustment).toBe(60);
    expect(body.referralGatePassed).toBe(true);
    expect(body.factors.find((f) => f.key === "cabinet-adjustment")?.points).toBe(60);
    expect(body.factors.reduce((a, f) => a + f.points, 0)).toBe(body.score);
  });

  it("a clamped adjustment reports its EFFECTIVE delta (sum still == score)", async () => {
    await prisma.user.update({ where: { id: subjectId }, data: { trustAdjustment: 130 } });
    const res = await GET(get({ token }));
    const body = (await res.json()) as TrustPayload;
    expect(body.score).toBe(100); // clamped
    const adj = body.factors.find((f) => f.key === "cabinet-adjustment");
    expect(adj?.points).toBe(100);
    expect(adj?.detail).toMatch(/clamped/i);
    expect(body.factors.reduce((a, f) => a + f.points, 0)).toBe(100);
  });
});
