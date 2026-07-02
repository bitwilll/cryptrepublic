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
let draftUserId: string;
let witnessedUserId: string;
let witnessedAppId: string;

interface ListBody {
  applications: Array<{
    id: string;
    status: string;
    user: { email: string | null; name: string | null };
  }>;
  page: number;
  pageSize: number;
  total: number;
}

describe("GET /api/admin/applications", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-apps-list");
    const now = Date.now();
    const draftUser = await prisma.user.create({
      data: {
        email: `adm-apps-draft-${now}@ex.org`,
        name: "Draft Applicant",
        application: { create: { status: "DRAFT", name: "Draft Applicant" } },
      },
    });
    draftUserId = draftUser.id;
    const witnessedUser = await prisma.user.create({
      data: {
        email: `adm-apps-witnessed-${now}@ex.org`,
        application: { create: { status: "WITNESSED" } },
      },
      include: { application: true },
    });
    witnessedUserId = witnessedUser.id;
    witnessedAppId = witnessedUser.application!.id;
  });

  beforeEach(() => __resetRateLimit());

  it("401 without a cookie / 401 suspended / 403 role USER", async () => {
    expect((await GET(adminGet("/api/admin/applications"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/applications", f.suspendedAdminToken))).status).toBe(
      401,
    );
    expect((await GET(adminGet("/api/admin/applications", f.userToken))).status).toBe(403);
  });

  it("400 on a status outside APP_STATUS_ORDER (the REAL machine, not the stale types.ts union)", async () => {
    expect(
      (await GET(adminGet("/api/admin/applications?status=SUBMITTED", f.adminToken))).status,
    ).toBe(400);
  });

  it("filters by status with the user email/name joined — no secrets serialized", async () => {
    const res = await GET(adminGet("/api/admin/applications?status=WITNESSED", f.adminToken));
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecretKeys(raw);
    const body = JSON.parse(raw) as ListBody;
    expect(body.applications.some((a) => a.id === witnessedAppId)).toBe(true);
    expect(body.applications.every((a) => a.status === "WITNESSED")).toBe(true);
    const mine = body.applications.find((a) => a.id === witnessedAppId)!;
    expect(mine.user.email).toContain("adm-apps-witnessed-");
  });

  it("lists all statuses without a filter (paginated)", async () => {
    const res = await GET(adminGet("/api/admin/applications?pageSize=100", f.adminToken));
    const body = (await res.json()) as ListBody;
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f, [draftUserId, witnessedUserId]);
    await prisma.$disconnect();
  });
});
