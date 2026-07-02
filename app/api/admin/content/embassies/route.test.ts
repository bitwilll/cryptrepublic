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
const CODE = "ZZT"; // test-only code, never seeded
const VALID = {
  code: CODE,
  name: "Test Embassy",
  neighborhood: "Alfama",
  hours: "09–17",
  foundedAt: "2026",
  brandColor: "#c8a96a",
  city: "Lisbon",
  country: "Portugal",
};

function itemParams(code: string) {
  return { params: Promise.resolve({ code }) };
}
function postEmbassy(o: { token?: string; origin?: string | null; body?: unknown }) {
  return POST(adminMutation("POST", "/api/admin/content/embassies", o.body, o));
}

describe("/api/admin/content/embassies", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-embassies");
    await prisma.embassyDirectory.deleteMany({ where: { code: CODE } });
  });

  beforeEach(() => __resetRateLimit());

  it("standard guard cases", async () => {
    expect(await standardGuardStatuses(postEmbassy, f, VALID)).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("create / list / update / delete with audit rows (before+after on update, before on delete)", async () => {
    expect((await postEmbassy({ token: f.adminToken, body: VALID })).status).toBe(200);
    expect((await postEmbassy({ token: f.adminToken, body: VALID })).status).toBe(400); // duplicate

    const list = await GET(adminGet("/api/admin/content/embassies", f.adminToken));
    const raw = await list.text();
    expectNoSecretKeys(raw);
    expect(
      (JSON.parse(raw) as { embassies: Array<{ code: string }> }).embassies.some(
        (e) => e.code === CODE,
      ),
    ).toBe(true);

    const put = await PUT(
      adminMutation(
        "PUT",
        `/api/admin/content/embassies/${CODE}`,
        { ...VALID, hours: "10–18" },
        { token: f.adminToken },
      ),
      itemParams(CODE),
    );
    expect(put.status).toBe(200);
    const updated = await prisma.embassyDirectory.findUniqueOrThrow({ where: { code: CODE } });
    expect(updated.hours).toBe("10–18");
    const updateAudit = await prisma.auditLog.findFirst({
      where: { action: "content.embassy.update", targetId: CODE },
      orderBy: { createdAt: "desc" },
    });
    expect(updateAudit).not.toBeNull();
    expect(updateAudit!.targetType).toBe("EMBASSY");
    expect((JSON.parse(updateAudit!.beforeJson!) as { hours: string }).hours).toBe("09–17");
    expect((JSON.parse(updateAudit!.afterJson!) as { hours: string }).hours).toBe("10–18");

    // code/path mismatch → 400
    const mismatch = await PUT(
      adminMutation(
        "PUT",
        `/api/admin/content/embassies/${CODE}`,
        { ...VALID, code: "XXQ" },
        { token: f.adminToken },
      ),
      itemParams(CODE),
    );
    expect(mismatch.status).toBe(400);

    const del = await DELETE(
      adminMutation("DELETE", `/api/admin/content/embassies/${CODE}`, undefined, {
        token: f.adminToken,
      }),
      itemParams(CODE),
    );
    expect(del.status).toBe(200);
    expect(await prisma.embassyDirectory.count({ where: { code: CODE } })).toBe(0);
    const delAudit = await prisma.auditLog.findFirst({
      where: { action: "content.embassy.delete", targetId: CODE },
    });
    expect(delAudit).not.toBeNull();
    expect((JSON.parse(delAudit!.beforeJson!) as { code: string }).code).toBe(CODE);

    const delAgain = await DELETE(
      adminMutation("DELETE", `/api/admin/content/embassies/${CODE}`, undefined, {
        token: f.adminToken,
      }),
      itemParams(CODE),
    );
    expect(delAgain.status).toBe(404);
  });

  afterAll(async () => {
    await prisma.embassyDirectory.deleteMany({ where: { code: CODE } });
    await prisma.auditLog.deleteMany({ where: { targetId: CODE } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
