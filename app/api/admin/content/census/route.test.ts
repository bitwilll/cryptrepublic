// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  adminMutation,
  expectNoSecretKeys,
  standardGuardStatuses,
  STANDARD_GUARD_EXPECTED,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET, POST } from "./route";
import { PUT, DELETE } from "./[code]/route";

let f: AdminFixtures;
const CODE = "ZZC"; // test-only code, never seeded
const VALID = {
  code: CODE,
  name: "Testville",
  lat: 38.7,
  long: -9.1,
  hasEmbassy: false,
  seededCount: 12,
};

function itemParams(code: string) {
  return { params: Promise.resolve({ code }) };
}
function postCensus(o: { token?: string; origin?: string | null; body?: unknown }) {
  return POST(adminMutation("POST", "/api/admin/content/census", o.body, o));
}

describe("/api/admin/content/census", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-census");
    await prisma.cityCensus.deleteMany({ where: { code: CODE } });
  });

  beforeEach(() => __resetRateLimit());

  it("standard guard cases", async () => {
    expect(await standardGuardStatuses(postCensus, f, VALID)).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("create / list / update / delete with audits", async () => {
    expect((await postCensus({ token: f.adminToken, body: VALID })).status).toBe(200);
    expect((await postCensus({ token: f.adminToken, body: VALID })).status).toBe(400); // duplicate

    const list = await GET(adminGet("/api/admin/content/census", f.adminToken));
    const raw = await list.text();
    expectNoSecretKeys(raw);
    expect(
      (JSON.parse(raw) as { census: Array<{ code: string }> }).census.some((c) => c.code === CODE),
    ).toBe(true);

    const put = await PUT(
      adminMutation(
        "PUT",
        `/api/admin/content/census/${CODE}`,
        { ...VALID, seededCount: 99 },
        { token: f.adminToken },
      ),
      itemParams(CODE),
    );
    expect(put.status).toBe(200);
    expect((await prisma.cityCensus.findUniqueOrThrow({ where: { code: CODE } })).seededCount).toBe(
      99,
    );
    const updateAudit = await prisma.auditLog.findFirst({
      where: { action: "content.census.update", targetId: CODE },
      orderBy: { createdAt: "desc" },
    });
    expect(updateAudit).not.toBeNull();
    expect(updateAudit!.targetType).toBe("CENSUS");
    expect((JSON.parse(updateAudit!.beforeJson!) as { seededCount: number }).seededCount).toBe(12);
    expect((JSON.parse(updateAudit!.afterJson!) as { seededCount: number }).seededCount).toBe(99);

    const del = await DELETE(
      adminMutation("DELETE", `/api/admin/content/census/${CODE}`, undefined, {
        token: f.adminToken,
      }),
      itemParams(CODE),
    );
    expect(del.status).toBe(200);
    expect(await prisma.cityCensus.count({ where: { code: CODE } })).toBe(0);
    const delAudit = await prisma.auditLog.findFirst({
      where: { action: "content.census.delete", targetId: CODE },
    });
    expect(delAudit).not.toBeNull();
  });

  afterAll(async () => {
    await prisma.cityCensus.deleteMany({ where: { code: CODE } });
    await prisma.auditLog.deleteMany({ where: { targetId: CODE } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
