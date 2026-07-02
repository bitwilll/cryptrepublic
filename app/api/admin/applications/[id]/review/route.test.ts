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
let applicantId: string;
let appId: string;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
function post(id: string, body: unknown, opts: { token?: string; origin?: string | null } = {}) {
  return POST(
    adminMutation("POST", `/api/admin/applications/${id}/review`, body, opts),
    params(id),
  );
}

describe("POST /api/admin/applications/[id]/review", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-review");
    const applicant = await prisma.user.create({
      data: {
        email: `adm-review-${Date.now()}@w9adm.example`,
        application: { create: { status: "OATH_ACCEPTED", citizenTokenId: null } },
      },
      include: { application: true },
    });
    applicantId = applicant.id;
    appId = applicant.application!.id;
  });

  beforeEach(() => __resetRateLimit());

  it("401 / 401-suspended / 403-role / 403-origin standard cases", async () => {
    expect((await post(appId, { reviewNote: "x" })).status).toBe(401);
    expect((await post(appId, { reviewNote: "x" }, { token: f.suspendedAdminToken })).status).toBe(
      401,
    );
    expect((await post(appId, { reviewNote: "x" }, { token: f.userToken })).status).toBe(403);
    expect(
      (
        await post(
          appId,
          { reviewNote: "x" },
          { token: f.adminToken, origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
  });

  it("404 for an unknown application id", async () => {
    expect((await post("nope", { reviewNote: "x" }, { token: f.adminToken })).status).toBe(404);
  });

  it("400 on an empty body (at least one of kycStatus/reviewNote required)", async () => {
    expect((await post(appId, {}, { token: f.adminToken })).status).toBe(400);
  });

  it("CONSTRAINT #6: status / citizenTokenId / sealTxHash are 400 by strictness — chain state cannot be faked", async () => {
    expect(
      (await post(appId, { kycStatus: "APPROVED", status: "SEALED" }, { token: f.adminToken }))
        .status,
    ).toBe(400);
    expect(
      (await post(appId, { reviewNote: "x", citizenTokenId: "9" }, { token: f.adminToken })).status,
    ).toBe(400);
    expect(
      (await post(appId, { reviewNote: "x", sealTxHash: "0xdead" }, { token: f.adminToken }))
        .status,
    ).toBe(400);
    const app = await prisma.citizenshipApplication.findUniqueOrThrow({ where: { id: appId } });
    expect(app.status).toBe("OATH_ACCEPTED");
    expect(app.citizenTokenId).toBeNull();
    expect(app.sealTxHash).toBeNull();
  });

  it("persists kycStatus + reviewNote ONLY + audits application.review", async () => {
    const res = await post(
      appId,
      { kycStatus: "APPROVED", reviewNote: "Docs verified." },
      { token: f.adminToken },
    );
    expect(res.status).toBe(200);
    expectNoSecretKeys(await res.text());

    const app = await prisma.citizenshipApplication.findUniqueOrThrow({ where: { id: appId } });
    expect(app.kycStatus).toBe("APPROVED");
    expect(app.reviewNote).toBe("Docs verified.");
    expect(app.status).toBe("OATH_ACCEPTED"); // untouched

    const audit = await prisma.auditLog.findFirst({
      where: { action: "application.review", targetId: appId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.targetType).toBe("APPLICATION");
    expectNoSecretKeys((audit!.beforeJson ?? "") + (audit!.afterJson ?? ""));
    expect((JSON.parse(audit!.beforeJson!) as { kycStatus: string }).kycStatus).toBe("NONE");
    expect((JSON.parse(audit!.afterJson!) as { reviewNote: string }).reviewNote).toBe(
      "Docs verified.",
    );
  });

  it("429 after the admin-apps limit (30/5min per admin)", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await post(appId, {}, { token: f.adminToken })).status).toBe(400);
    }
    expect((await post(appId, { reviewNote: "x" }, { token: f.adminToken })).status).toBe(429);
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f, [applicantId]);
    await prisma.$disconnect();
  });
});
