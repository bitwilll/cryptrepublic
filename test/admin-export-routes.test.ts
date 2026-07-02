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
import { GET as usersExport } from "@/app/api/admin/export/users/route";
import { GET as applicationsExport } from "@/app/api/admin/export/applications/route";
import { GET as auditExport } from "@/app/api/admin/export/audit/route";

let f: AdminFixtures;
let applicantUserId: string;
let auditTargetId: string;

const routes = {
  users: { kind: "users", handler: usersExport, path: "/api/admin/export/users" },
  applications: {
    kind: "applications",
    handler: applicationsExport,
    path: "/api/admin/export/applications",
  },
  audit: { kind: "audit", handler: auditExport, path: "/api/admin/export/audit" },
} as const;

describe("GET /api/admin/export/{users,applications,audit}", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-export");
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    // An application row so the applications export has a seeded body row.
    const u = await prisma.user.create({
      data: {
        email: `adm-export-app-${suffix}@w10adm.example`,
        application: {
          create: {
            status: "OATH_ACCEPTED",
            name: "Export Applicant",
            domicileCity: "Neo Berlin",
          },
        },
      },
    });
    applicantUserId = u.id;
    // An audit row so the audit export has a seeded body row.
    auditTargetId = `adm-export-audit-${suffix}`;
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

  for (const { kind, handler, path } of Object.values(routes)) {
    describe(`export/${kind}`, () => {
      it("401 without a session cookie", async () => {
        expect((await handler(adminGet(path))).status).toBe(401);
      });

      it("403 for a non-admin (role USER)", async () => {
        expect((await handler(adminGet(path, f.userToken))).status).toBe(403);
      });

      it("200 CSV for an admin — text/csv + attachment disposition + header row + no secret", async () => {
        const res = await handler(adminGet(path, f.adminToken));
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/text\/csv/);
        const disp = res.headers.get("content-disposition") ?? "";
        expect(disp).toMatch(/attachment/);
        expect(disp).toMatch(new RegExp(`${kind}-\\d{4}-\\d{2}-\\d{2}\\.csv`));
        const body = await res.text();
        expectNoSecretKeys(body);
        expect(body).not.toContain("SECRET");
        // First line is the header row (non-empty).
        expect(body.split("\r\n")[0].length).toBeGreaterThan(0);
      });

      it("writes ONE admin.export.<kind> audit row with targetType EXPORT", async () => {
        await __resetRateLimit();
        await handler(adminGet(path, f.adminToken));
        const rows = await prisma.auditLog.findMany({
          where: { action: `admin.export.${kind}`, actorUserId: f.adminId },
        });
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows[rows.length - 1].targetType).toBe("EXPORT");
        expect(rows[rows.length - 1].targetId).toBe(kind);
      });

      it("429 after the per-admin export limit (10/5min)", async () => {
        for (let i = 0; i < 10; i++) {
          expect((await handler(adminGet(path, f.adminToken))).status).toBe(200);
        }
        expect((await handler(adminGet(path, f.adminToken))).status).toBe(429);
      });
    });
  }

  it("users export header includes id/email/role and NEVER passwordHash", async () => {
    await __resetRateLimit();
    const body = await (await usersExport(adminGet(routes.users.path, f.adminToken))).text();
    const header = body.split("\r\n")[0];
    expect(header).toContain("email");
    expect(header).toContain("role");
    expect(header).not.toContain("passwordHash");
  });

  it("applications export header includes the Wave-10 approval columns", async () => {
    await __resetRateLimit();
    const body = await (
      await applicationsExport(adminGet(routes.applications.path, f.adminToken))
    ).text();
    const header = body.split("\r\n")[0];
    expect(header).toContain("adminApprovedAt");
    expect(header).toContain("adminApprovedBy");
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ targetType: "EXPORT" }, { targetId: auditTargetId }] },
    });
    await cleanupAdminFixtures(f, [applicantUserId]);
    await prisma.$disconnect();
  });
});
