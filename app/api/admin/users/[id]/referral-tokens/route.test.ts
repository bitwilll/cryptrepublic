// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminMutation,
  expectNoSecretKeys,
  standardGuardStatuses,
  STANDARD_GUARD_EXPECTED,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { POST } from "./route";

/**
 * POST /api/admin/users/[id]/referral-tokens (Wave 12 C1). Guard stack + a
 * strict add-only delta + an in-transaction `referral.token.allocate` USER
 * audit row that never leaks a secret column.
 */
let f: AdminFixtures;
const PATH = (id: string) => `/api/admin/users/${id}/referral-tokens`;

async function call(id: string, o: { token?: string; origin?: string | null; body?: unknown }) {
  return POST(adminMutation("POST", PATH(id), o.body, { token: o.token, origin: o.origin }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/admin/users/[id]/referral-tokens", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-reftok");
  });
  beforeEach(() => __resetRateLimit());
  afterAll(async () => {
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });

  it("passes the standard guard matrix (401/401/403/403/400)", async () => {
    const statuses = await standardGuardStatuses((o) => call(f.userId, o), f, { delta: 5 });
    expect(statuses).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("rejects a non-positive / oversized / unknown-key body (400)", async () => {
    expect((await call(f.userId, { token: f.adminToken, body: { delta: 0 } })).status).toBe(400);
    expect((await call(f.userId, { token: f.adminToken, body: { delta: -5 } })).status).toBe(400);
    expect((await call(f.userId, { token: f.adminToken, body: { delta: 1001 } })).status).toBe(400);
    expect((await call(f.userId, { token: f.adminToken, body: { zz: 1 } })).status).toBe(400);
  });

  it("404 for a missing user", async () => {
    expect((await call("nope-user-id", { token: f.adminToken, body: { delta: 5 } })).status).toBe(
      404,
    );
  });

  it("increments the balance and writes a referral.token.allocate USER audit row (no secret)", async () => {
    await prisma.user.update({ where: { id: f.userId }, data: { referralTokenBalance: 2 } });
    const res = await call(f.userId, { token: f.adminToken, body: { delta: 5 } });
    expect(res.status).toBe(200);
    const bodyText = await res.clone().text();
    expectNoSecretKeys(bodyText);
    expect((await res.json()).referralTokenBalance).toBe(7);

    const u = await prisma.user.findUnique({ where: { id: f.userId } });
    expect(u?.referralTokenBalance).toBe(7);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "referral.token.allocate", targetId: f.userId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.actorUserId).toBe(f.adminId);
    expect(audit?.targetType).toBe("USER");
    expect(audit?.afterJson).toContain("referralTokenBalance");
    expect(audit?.afterJson).not.toContain("passwordHash");
    expect(audit?.afterJson).not.toContain("tokenHash");
  });
});
