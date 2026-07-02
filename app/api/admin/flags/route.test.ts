// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { FLAG_DEFAULTS } from "@/lib/flags/defaults";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  adminMutation,
  expectNoSecretKeys,
  standardGuardStatuses,
  STANDARD_GUARD_EXPECTED,
  statusAfterLimit,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET, POST } from "./route";
import { DELETE } from "./[key]/route";

let f: AdminFixtures;
const KEY = `test_wave9_flag_${Date.now()}`;

function itemParams(key: string) {
  return { params: Promise.resolve({ key }) };
}
function postFlag(o: { token?: string; origin?: string | null; body?: unknown }) {
  return POST(adminMutation("POST", "/api/admin/flags", o.body, o));
}
function delFlag(key: string, o: { token?: string; origin?: string | null } = {}) {
  return DELETE(adminMutation("DELETE", `/api/admin/flags/${key}`, undefined, o), itemParams(key));
}

describe("/api/admin/flags", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-flags");
    await prisma.featureFlag.deleteMany({ where: { key: KEY } });
  });

  beforeEach(() => __resetRateLimit());

  it("standard guard cases", async () => {
    expect(await standardGuardStatuses(postFlag, f, { key: KEY, enabled: true })).toEqual(
      STANDARD_GUARD_EXPECTED,
    );
  });

  it("upsert creates then updates + audits flag.upsert (before only when a row existed)", async () => {
    const created = await postFlag({
      token: f.adminToken,
      body: { key: KEY, enabled: true, description: "test flag" },
    });
    expect(created.status).toBe(200);
    expectNoSecretKeys(await created.text());
    expect((await prisma.featureFlag.findUniqueOrThrow({ where: { key: KEY } })).enabled).toBe(
      true,
    );
    const createAudit = await prisma.auditLog.findFirst({
      where: { action: "flag.upsert", targetId: KEY },
      orderBy: { createdAt: "desc" },
    });
    expect(createAudit).not.toBeNull();
    expect(createAudit!.targetType).toBe("FLAG");
    expect(createAudit!.beforeJson).toBeNull();
    expect((JSON.parse(createAudit!.afterJson!) as { enabled: boolean }).enabled).toBe(true);

    const updated = await postFlag({ token: f.adminToken, body: { key: KEY, enabled: false } });
    expect(updated.status).toBe(200);
    expect((await prisma.featureFlag.findUniqueOrThrow({ where: { key: KEY } })).enabled).toBe(
      false,
    );
    const updateAudit = await prisma.auditLog.findFirst({
      where: { action: "flag.upsert", targetId: KEY },
      orderBy: { createdAt: "desc" },
    });
    expect((JSON.parse(updateAudit!.beforeJson!) as { enabled: boolean }).enabled).toBe(true);
    expect((JSON.parse(updateAudit!.afterJson!) as { enabled: boolean }).enabled).toBe(false);
  });

  it("GET merges the DECLARED defaults so the UI can show effective values", async () => {
    const res = await GET(adminGet("/api/admin/flags", f.adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      flags: Array<{ key: string; enabled: boolean }>;
      defaults: Record<string, boolean>;
    };
    expect(body.flags.some((r) => r.key === KEY)).toBe(true);
    expect(body.defaults).toEqual(FLAG_DEFAULTS);
  });

  it("DELETE removes the row + audits flag.delete with before preserved; 404 after", async () => {
    const res = await delFlag(KEY, { token: f.adminToken });
    expect(res.status).toBe(200);
    expect(await prisma.featureFlag.count({ where: { key: KEY } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "flag.delete", targetId: KEY },
    });
    expect(audit).not.toBeNull();
    expect(audit!.afterJson).toBeNull();
    expect((JSON.parse(audit!.beforeJson!) as { key: string }).key).toBe(KEY);
    expect((await delFlag(KEY, { token: f.adminToken })).status).toBe(404);
  });

  it("429 after the admin-flags limit (30/5min per admin)", async () => {
    expect(await statusAfterLimit((body) => postFlag({ token: f.adminToken, body }), 30)).toBe(429);
  });

  afterAll(async () => {
    await prisma.featureFlag.deleteMany({ where: { key: KEY } });
    await prisma.auditLog.deleteMany({ where: { targetId: KEY } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
