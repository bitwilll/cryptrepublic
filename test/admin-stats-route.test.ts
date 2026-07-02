// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { APP_STATUS_ORDER } from "@/lib/applications/state";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  expectNoSecretKeys,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET as statsGet } from "@/app/api/admin/stats/route";

/**
 * GET /api/admin/stats (Wave 10 C2) — the infographics data endpoint. Honesty
 * contract under test: applications-by-status in APP_STATUS_ORDER, citizens
 * NULL + chainAvailable:false when the chain is unregistered (default test
 * env — the graceful catch, never a fabricated count), audit activity bucketed
 * over the full window (empty days present as 0), census rows carrying
 * censusSource:"seeded" (CityCensus.seededCount is demonstrative geography,
 * never live citizen distribution), and NO secret column anywhere.
 */

const PATH = "/api/admin/stats";
let f: AdminFixtures;
let auditTargetId: string;

describe("GET /api/admin/stats", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-stats");
    // One audit row INSIDE the window so today's bucket counts ≥ 1.
    auditTargetId = `adm-stats-audit-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await prisma.$transaction(async (tx) => {
      const { writeAudit } = await import("@/lib/admin/audit");
      await writeAudit(tx, {
        actorUserId: f.adminId,
        actorLabel: `admin:${f.adminEmail}`,
        action: "flag.upsert",
        targetType: "FLAG",
        targetId: auditTargetId,
        after: { key: auditTargetId, enabled: true },
      });
    });
  });

  beforeEach(() => __resetRateLimit());

  it("401 without a session cookie", async () => {
    expect((await statsGet(adminGet(PATH))).status).toBe(401);
  });

  it("403 for a non-admin (role USER)", async () => {
    expect((await statsGet(adminGet(PATH, f.userToken))).status).toBe(403);
  });

  it("401 for a suspended admin (token minted before suspension)", async () => {
    expect((await statsGet(adminGet(PATH, f.suspendedAdminToken))).status).toBe(401);
  });

  it("200 — applicationsByStatus in APP_STATUS_ORDER with numeric counts", async () => {
    const res = await statsGet(adminGet(PATH, f.adminToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applicationsByStatus.map((r: { status: string }) => r.status)).toEqual([
      ...APP_STATUS_ORDER,
    ]);
    for (const row of body.applicationsByStatus) {
      expect(Number.isInteger(row.count)).toBe(true);
      expect(row.count).toBeGreaterThanOrEqual(0);
    }
  });

  it("200 — honest chain state: unregistered chain → citizens NULL + chainAvailable false (never a fabricated count)", async () => {
    const body = await (await statsGet(adminGet(PATH, f.adminToken))).json();
    expect(body.chainAvailable).toBe(false);
    expect(body.counts.citizens).toBeNull();
    // DB-derived counts are real integers.
    expect(Number.isInteger(body.counts.users)).toBe(true);
    expect(body.counts.users).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(body.counts.embassies)).toBe(true);
  });

  it("200 — auditActivity: 14 ISO-day buckets, empty days present with 0, today's seeded row counted", async () => {
    const body = await (await statsGet(adminGet(PATH, f.adminToken))).json();
    expect(body.auditActivity).toHaveLength(14);
    for (const b of body.auditActivity) {
      expect(b.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(b.count)).toBe(true);
      expect(b.count).toBeGreaterThanOrEqual(0);
    }
    // Chronological, last bucket = today (UTC), and it counts the seeded row.
    const days = body.auditActivity.map((b: { day: string }) => b.day);
    expect([...days].sort()).toEqual(days);
    const today = new Date().toISOString().slice(0, 10);
    expect(days[13]).toBe(today);
    expect(body.auditActivity[13].count).toBeGreaterThanOrEqual(1);
  });

  it("200 — census: rows from CityCensus.seededCount MUST carry censusSource 'seeded' (demonstrative, not live)", async () => {
    const body = await (await statsGet(adminGet(PATH, f.adminToken))).json();
    expect(["live", "seeded"]).toContain(body.censusSource);
    // This implementation reads CityCensus.seededCount → it must say so.
    expect(body.censusSource).toBe("seeded");
    for (const row of body.censusByCity) {
      expect(typeof row.code).toBe("string");
      expect(typeof row.name).toBe("string");
      expect(Number.isInteger(row.count)).toBe(true);
    }
  });

  it("200 — no secret column anywhere in the payload", async () => {
    const res = await statsGet(adminGet(PATH, f.adminToken));
    expectNoSecretKeys(await res.text());
  });

  it("429 after the per-admin stats limit (30/min)", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await statsGet(adminGet(PATH, f.adminToken))).status).toBe(200);
    }
    expect((await statsGet(adminGet(PATH, f.adminToken))).status).toBe(429);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { targetId: auditTargetId } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
