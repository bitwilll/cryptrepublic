// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminMutation,
  expectNoSecretKeys,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { POST } from "./route";

let f: AdminFixtures;
let targetId: string;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
function post(id: string, body: unknown, opts: { token?: string; origin?: string | null } = {}) {
  return POST(adminMutation("POST", `/api/admin/users/${id}/kyc`, body, opts), params(id));
}

describe("POST /api/admin/users/[id]/kyc", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-kyc");
    const target = await prisma.user.create({
      data: { email: `adm-kyc-target-${Date.now()}@ex.org` },
    });
    targetId = target.id;
  });

  beforeEach(() => __resetRateLimit());

  it("401 without a cookie", async () => {
    expect((await post(targetId, { kycStatus: "APPROVED" })).status).toBe(401);
  });

  it("401 for a suspended admin", async () => {
    expect(
      (await post(targetId, { kycStatus: "APPROVED" }, { token: f.suspendedAdminToken })).status,
    ).toBe(401);
  });

  it("403 for role USER", async () => {
    expect((await post(targetId, { kycStatus: "APPROVED" }, { token: f.userToken })).status).toBe(
      403,
    );
  });

  it("403 from a foreign origin", async () => {
    const res = await post(
      targetId,
      { kycStatus: "APPROVED" },
      { token: f.adminToken, origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
  });

  it("400 on an unknown kycStatus", async () => {
    expect((await post(targetId, { kycStatus: "NOPE" }, { token: f.adminToken })).status).toBe(400);
  });

  it("400 when the body smuggles a role key (NO promotion path)", async () => {
    const res = await post(
      targetId,
      { kycStatus: "APPROVED", role: "ADMIN" },
      { token: f.adminToken },
    );
    expect(res.status).toBe(400);
    const target = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(target.role).toBe("USER");
  });

  it("404 for an unknown user id", async () => {
    expect((await post("nope", { kycStatus: "APPROVED" }, { token: f.adminToken })).status).toBe(
      404,
    );
  });

  it("sets kycStatus + audits user.kyc.set with before/after", async () => {
    const res = await post(targetId, { kycStatus: "APPROVED" }, { token: f.adminToken });
    expect(res.status).toBe(200);
    expectNoSecretKeys(await res.text());

    const target = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(target.kycStatus).toBe("APPROVED");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "user.kyc.set", targetId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.targetType).toBe("USER");
    expectNoSecretKeys((audit!.beforeJson ?? "") + (audit!.afterJson ?? ""));
    expect((JSON.parse(audit!.beforeJson!) as { kycStatus: string }).kycStatus).toBe("NONE");
    expect((JSON.parse(audit!.afterJson!) as { kycStatus: string }).kycStatus).toBe("APPROVED");
  });

  it("429 after the admin-users limit", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await post(targetId, {}, { token: f.adminToken })).status).toBe(400);
    }
    expect((await post(targetId, { kycStatus: "NONE" }, { token: f.adminToken })).status).toBe(429);
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f, [targetId]);
    await prisma.$disconnect();
  });
});
