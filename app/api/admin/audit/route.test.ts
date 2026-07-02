// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  expectNoSecretKeys,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET } from "./route";

let f: AdminFixtures;
const MARKER_ACTION = `test.audit.marker.${Date.now()}`;

interface AuditBody {
  rows: Array<{ id: string; action: string; actorUserId: string | null; targetId: string }>;
  page: number;
  pageSize: number;
  total: number;
}

describe("GET /api/admin/audit", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-audit-list");
    // Three marker rows, oldest → newest (unique action so parallel suites can't
    // interfere). createdAt is pinned EXPLICITLY — a fast loop lands all three in
    // the same millisecond and makes desc ordering a coin toss.
    const base = Date.now() - 60_000;
    for (let i = 0; i < 3; i++) {
      await prisma.auditLog.create({
        data: {
          actorUserId: f.adminId,
          actorLabel: `admin:${f.adminEmail}`,
          action: MARKER_ACTION,
          targetType: "USER",
          targetId: `marker-${i}`,
          createdAt: new Date(base + i * 1000),
        },
      });
    }
  });

  beforeEach(() => __resetRateLimit());

  it("401 without a cookie / 401 suspended / 403 role USER", async () => {
    expect((await GET(adminGet("/api/admin/audit"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/audit", f.suspendedAdminToken))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/audit", f.userToken))).status).toBe(403);
  });

  it("filters by action, newest first — no secrets serialized", async () => {
    const res = await GET(adminGet(`/api/admin/audit?action=${MARKER_ACTION}`, f.adminToken));
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecretKeys(raw);
    const body = JSON.parse(raw) as AuditBody;
    expect(body.total).toBe(3);
    expect(body.rows.length).toBe(3);
    expect(body.rows[0].targetId).toBe("marker-2"); // newest first
    expect(body.rows.every((r) => r.action === MARKER_ACTION)).toBe(true);
  });

  it("filters by actorUserId", async () => {
    const res = await GET(
      adminGet(`/api/admin/audit?action=${MARKER_ACTION}&actorUserId=${f.adminId}`, f.adminToken),
    );
    const body = (await res.json()) as AuditBody;
    expect(body.total).toBe(3);
    const none = await GET(
      adminGet(`/api/admin/audit?action=${MARKER_ACTION}&actorUserId=${f.userId}`, f.adminToken),
    );
    expect(((await none.json()) as AuditBody).total).toBe(0);
  });

  it("paginates (pageSize=2 → 2 rows page 1, 1 row page 2)", async () => {
    const p1 = (await (
      await GET(
        adminGet(`/api/admin/audit?action=${MARKER_ACTION}&page=1&pageSize=2`, f.adminToken),
      )
    ).json()) as AuditBody;
    expect(p1.rows.length).toBe(2);
    expect(p1.total).toBe(3);
    const p2 = (await (
      await GET(
        adminGet(`/api/admin/audit?action=${MARKER_ACTION}&page=2&pageSize=2`, f.adminToken),
      )
    ).json()) as AuditBody;
    expect(p2.rows.length).toBe(1);
  });

  it("400 on invalid pagination (page 0 / pageSize > 100 / non-numeric)", async () => {
    expect((await GET(adminGet(`/api/admin/audit?page=0`, f.adminToken))).status).toBe(400);
    expect((await GET(adminGet(`/api/admin/audit?pageSize=101`, f.adminToken))).status).toBe(400);
    expect((await GET(adminGet(`/api/admin/audit?page=x`, f.adminToken))).status).toBe(400);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { action: MARKER_ACTION } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
