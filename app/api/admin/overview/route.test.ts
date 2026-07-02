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
import { GET } from "./route";

let f: AdminFixtures;
let applicantId: string;

interface OverviewBody {
  users: { total: number; suspended: number; admins: number };
  applications: Record<string, number>;
  content: {
    assets: number;
    embassies: number;
    census: number;
    allocations: number;
    constitution: number;
    proposalContent: number;
    comments: number;
  };
  flags: number;
  recentAudit: Array<{ id: string; action: string; createdAt: string }>;
}

describe("GET /api/admin/overview", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-overview");
    const applicant = await prisma.user.create({
      data: {
        email: `adm-overview-${Date.now()}@w9adm.example`,
        application: { create: { status: "ATTESTED" } },
      },
    });
    applicantId = applicant.id;
  });

  beforeEach(() => __resetRateLimit());

  it("401 without a cookie / 401 suspended / 403 role USER", async () => {
    expect((await GET(adminGet("/api/admin/overview"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/overview", f.suspendedAdminToken))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/overview", f.userToken))).status).toBe(403);
  });

  it("returns counts + recent audit — shape complete, no secrets serialized", async () => {
    const res = await GET(adminGet("/api/admin/overview", f.adminToken));
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecretKeys(raw);
    const body = JSON.parse(raw) as OverviewBody;

    // The fixtures guarantee at least: 3 fixture users + applicant; 1 suspended; 2 admins.
    expect(body.users.total).toBeGreaterThanOrEqual(4);
    expect(body.users.suspended).toBeGreaterThanOrEqual(1);
    expect(body.users.admins).toBeGreaterThanOrEqual(2);

    // Every REAL AppStatus key present (lib/applications/state.ts, not the stale union).
    for (const s of APP_STATUS_ORDER) {
      expect(typeof body.applications[s]).toBe("number");
    }
    expect(body.applications.ATTESTED).toBeGreaterThanOrEqual(1);

    for (const key of [
      "assets",
      "embassies",
      "census",
      "allocations",
      "constitution",
      "proposalContent",
      "comments",
    ] as const) {
      expect(typeof body.content[key]).toBe("number");
    }
    expect(typeof body.flags).toBe("number");
    expect(Array.isArray(body.recentAudit)).toBe(true);
    expect(body.recentAudit.length).toBeLessThanOrEqual(10);
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f, [applicantId]);
    await prisma.$disconnect();
  });
});
