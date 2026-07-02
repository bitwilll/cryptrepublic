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
import { PUT, DELETE } from "./[key]/route";

let f: AdminFixtures;
const KEY = `test_wave9_${Date.now()}`;
const VALID = { key: KEY, title: "Test Article", body: "Body text.", citation: "TEST §1" };

function itemParams(key: string) {
  return { params: Promise.resolve({ key }) };
}
function postEntry(o: { token?: string; origin?: string | null; body?: unknown }) {
  return POST(adminMutation("POST", "/api/admin/content/constitution", o.body, o));
}

describe("/api/admin/content/constitution", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-constitution");
  });

  beforeEach(() => __resetRateLimit());

  it("standard guard cases", async () => {
    expect(await standardGuardStatuses(postEntry, f, VALID)).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("create / list / update / delete with audits (targetType CONSTITUTION)", async () => {
    expect((await postEntry({ token: f.adminToken, body: VALID })).status).toBe(200);
    expect((await postEntry({ token: f.adminToken, body: VALID })).status).toBe(400); // duplicate

    const list = await GET(adminGet("/api/admin/content/constitution", f.adminToken));
    const raw = await list.text();
    expectNoSecretKeys(raw);
    expect(
      (JSON.parse(raw) as { entries: Array<{ key: string }> }).entries.some((e) => e.key === KEY),
    ).toBe(true);

    const put = await PUT(
      adminMutation(
        "PUT",
        `/api/admin/content/constitution/${KEY}`,
        { ...VALID, body: "Amended body." },
        { token: f.adminToken },
      ),
      itemParams(KEY),
    );
    expect(put.status).toBe(200);
    const updated = await prisma.constitutionText.findUniqueOrThrow({ where: { key: KEY } });
    expect(updated.body).toBe("Amended body.");
    const updateAudit = await prisma.auditLog.findFirst({
      where: { action: "content.constitution.update", targetId: KEY },
      orderBy: { createdAt: "desc" },
    });
    expect(updateAudit).not.toBeNull();
    expect(updateAudit!.targetType).toBe("CONSTITUTION");
    expect((JSON.parse(updateAudit!.beforeJson!) as { body: string }).body).toBe("Body text.");
    expect((JSON.parse(updateAudit!.afterJson!) as { body: string }).body).toBe("Amended body.");

    const del = await DELETE(
      adminMutation("DELETE", `/api/admin/content/constitution/${KEY}`, undefined, {
        token: f.adminToken,
      }),
      itemParams(KEY),
    );
    expect(del.status).toBe(200);
    expect(await prisma.constitutionText.count({ where: { key: KEY } })).toBe(0);
    const delAudit = await prisma.auditLog.findFirst({
      where: { action: "content.constitution.delete", targetId: KEY },
    });
    expect(delAudit).not.toBeNull();
    expect((JSON.parse(delAudit!.beforeJson!) as { body: string }).body).toBe("Amended body.");
  });

  afterAll(async () => {
    await prisma.constitutionText.deleteMany({ where: { key: KEY } });
    await prisma.auditLog.deleteMany({ where: { targetId: KEY } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
