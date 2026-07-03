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
 * POST /api/admin/users/[id]/trust (Wave 12 C2). Guard stack + a strict
 * absolute -100..100 adjustment + an in-transaction `trust.adjust` audit row.
 * Absolute (re-post is idempotent) and audited every time.
 */
let f: AdminFixtures;
const PATH = (id: string) => `/api/admin/users/${id}/trust`;

async function call(id: string, o: { token?: string; origin?: string | null; body?: unknown }) {
  return POST(adminMutation("POST", PATH(id), o.body, { token: o.token, origin: o.origin }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/admin/users/[id]/trust", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-trust");
  });
  beforeEach(() => __resetRateLimit());
  afterAll(async () => {
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });

  it("passes the standard guard matrix (401/401/403/403/400)", async () => {
    const statuses = await standardGuardStatuses((o) => call(f.userId, o), f, { adjustment: 10 });
    expect(statuses).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("rejects an out-of-range / unknown-key body (400)", async () => {
    expect((await call(f.userId, { token: f.adminToken, body: { adjustment: 200 } })).status).toBe(
      400,
    );
    expect((await call(f.userId, { token: f.adminToken, body: { adjustment: -200 } })).status).toBe(
      400,
    );
    expect((await call(f.userId, { token: f.adminToken, body: { zz: 1 } })).status).toBe(400);
  });

  it("404 for a missing user", async () => {
    expect(
      (await call("nope-user-id", { token: f.adminToken, body: { adjustment: 10 } })).status,
    ).toBe(404);
  });

  it("SETS the absolute adjustment + audits; re-post is idempotent (not accumulated) + re-audited", async () => {
    const first = await call(f.userId, { token: f.adminToken, body: { adjustment: -30 } });
    expect(first.status).toBe(200);
    expectNoSecretKeys(await first.clone().text());
    expect((await first.json()).trustAdjustment).toBe(-30);
    expect((await prisma.user.findUnique({ where: { id: f.userId } }))?.trustAdjustment).toBe(-30);

    // Re-post with a new value → SET (absolute), not accumulated.
    const second = await call(f.userId, { token: f.adminToken, body: { adjustment: 10 } });
    expect((await second.json()).trustAdjustment).toBe(10);
    expect((await prisma.user.findUnique({ where: { id: f.userId } }))?.trustAdjustment).toBe(10);

    const rows = await prisma.auditLog.findMany({
      where: { action: "trust.adjust", targetId: f.userId },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2); // one row per POST
    const latest = rows[rows.length - 1];
    expect(latest.afterJson).toContain("trustAdjustment");
    expect(latest.afterJson).not.toContain("passwordHash");
  });
});
