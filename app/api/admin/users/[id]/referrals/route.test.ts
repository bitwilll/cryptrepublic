// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  type AdminFixtures,
} from "@/test/adminTestUtils";

/**
 * GET /api/admin/users/[id]/referrals (Wave 12 C3). Guarded read; lists the
 * user's outgoing referrals with a CHAIN-DERIVED becameCitizen (mocked here)
 * and the trust breakdown (computeTrustScore mocked). 403 for a non-admin.
 */

const citizens = new Set<string>();
vi.mock("@/lib/passport/serverReads", () => ({
  readHasPassportServer: async (_c: number, addr: string) => citizens.has(addr.toLowerCase()),
  readPassportStatusServer: async () => ({ isCitizen: false, tokenId: null }),
}));
vi.mock("@/lib/trust/score", () => ({
  computeTrustScore: async () => ({
    computed: 40,
    adminAdjustment: 10,
    finalScore: 50,
    signals: {
      isCitizen: true,
      tenureBlocks: 0,
      referralsBecameCitizens: 1,
      governanceVotes: 0,
      dividendClaims: 0,
    },
  }),
}));

const A = "0x00000000000000000000000000000000000000A1";
const B = "0x00000000000000000000000000000000000000B2";
vi.mock("@/lib/applications/applicant", () => ({
  // referred[0] → A (a citizen), referred[1] → B (not), referrer → null.
  resolveApplicantAddress: async (userId: string) => addrByUser.get(userId) ?? null,
}));

const addrByUser = new Map<string, string>();

import { GET } from "./route";

let f: AdminFixtures;
let subjectId: string;
let ref1Id: string;
let ref2Id: string;

async function call(id: string, token?: string) {
  return GET(adminGet(`/api/admin/users/${id}/referrals`, token), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/admin/users/[id]/referrals", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-userref");
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const subject = await prisma.user.create({
      data: { email: `subj-${suffix}@w12c3.example`, referralTokenBalance: 2, trustAdjustment: 10 },
    });
    const r1 = await prisma.user.create({ data: { email: `r1-${suffix}@w12c3.example` } });
    const r2 = await prisma.user.create({ data: { email: `r2-${suffix}@w12c3.example` } });
    subjectId = subject.id;
    ref1Id = r1.id;
    ref2Id = r2.id;
    addrByUser.set(ref1Id, A);
    addrByUser.set(ref2Id, B);
    citizens.add(A.toLowerCase()); // r1 became a citizen; r2 did not
    await prisma.referral.createMany({
      data: [
        { referrerUserId: subjectId, referredUserId: ref1Id, whenTokenConsumed: true },
        { referrerUserId: subjectId, referredUserId: ref2Id, whenTokenConsumed: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.referral.deleteMany({ where: { referrerUserId: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: [subjectId, ref1Id, ref2Id] } } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });

  it("403 for a non-admin", async () => {
    expect((await call(subjectId, f.userToken)).status).toBe(403);
  });

  it("404 for a missing user", async () => {
    expect((await call("nope-user-id", f.adminToken)).status).toBe(404);
  });

  it("returns the referrals with chain-derived becameCitizen + the trust breakdown", async () => {
    const res = await call(subjectId, f.adminToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.referralTokenBalance).toBe(2);
    expect(body.trust.finalScore).toBe(50);
    expect(body.trust.chainDerived).toBe(true);
    expect(body.referrals).toHaveLength(2);
    const byEmail = Object.fromEntries(
      body.referrals.map((r: { referredEmail: string; becameCitizen: boolean }) => [
        r.referredEmail,
        r.becameCitizen,
      ]),
    );
    const r1email = (await prisma.user.findUnique({ where: { id: ref1Id } }))!.email!;
    const r2email = (await prisma.user.findUnique({ where: { id: ref2Id } }))!.email!;
    expect(byEmail[r1email]).toBe(true); // A is a citizen
    expect(byEmail[r2email]).toBe(false); // B is not
  });
});
