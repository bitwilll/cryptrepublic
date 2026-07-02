// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession, validateSessionToken } from "@/lib/auth/session";
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
let targetToken: string;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
function post(id: string, body: unknown, opts: { token?: string; origin?: string | null } = {}) {
  return POST(adminMutation("POST", `/api/admin/users/${id}/suspend`, body, opts), params(id));
}

describe("POST /api/admin/users/[id]/suspend", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-suspend");
    const target = await prisma.user.create({
      data: { email: `adm-suspend-target-${Date.now()}@w9adm.example` },
    });
    targetId = target.id;
    ({ token: targetToken } = await createSession(targetId));
    await createSession(targetId); // a second session — suspend must revoke ALL
  });

  beforeEach(() => __resetRateLimit());

  it("401 without a cookie", async () => {
    expect((await post(targetId, { suspended: true })).status).toBe(401);
  });

  it("401 for a suspended admin", async () => {
    expect(
      (await post(targetId, { suspended: true }, { token: f.suspendedAdminToken })).status,
    ).toBe(401);
  });

  it("403 for role USER", async () => {
    expect((await post(targetId, { suspended: true }, { token: f.userToken })).status).toBe(403);
  });

  it("403 from a foreign origin", async () => {
    const res = await post(
      targetId,
      { suspended: true },
      { token: f.adminToken, origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
  });

  it("400 on an unknown key (strict)", async () => {
    expect(
      (await post(targetId, { suspended: true, role: "ADMIN" }, { token: f.adminToken })).status,
    ).toBe(400);
  });

  it("400 when an admin tries to suspend THEMSELVES (self-lockout guard)", async () => {
    const res = await post(f.adminId, { suspended: true }, { token: f.adminToken });
    expect(res.status).toBe(400);
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: f.adminId } });
    expect(admin.suspendedAt).toBeNull();
  });

  it("404 for an unknown user id", async () => {
    expect((await post("nope", { suspended: true }, { token: f.adminToken })).status).toBe(404);
  });

  it("suspend: sets suspendedAt + revokes ALL sessions + audits user.suspend in ONE transaction", async () => {
    expect(await validateSessionToken(targetToken)).not.toBeNull();
    const res = await post(targetId, { suspended: true }, { token: f.adminToken });
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecretKeys(raw);

    const target = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(target.suspendedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: targetId } })).toBe(0);
    // A1 integration: the old token is dead over the choke point too.
    expect(await validateSessionToken(targetToken)).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "user.suspend", targetId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorUserId).toBe(f.adminId);
    expect(audit!.actorLabel).toBe(`admin:${f.adminEmail}`);
    expect(audit!.targetType).toBe("USER");
    expectNoSecretKeys((audit!.beforeJson ?? "") + (audit!.afterJson ?? ""));
    const before = JSON.parse(audit!.beforeJson!) as { suspendedAt: string | null };
    const after = JSON.parse(audit!.afterJson!) as { suspendedAt: string | null };
    expect(before.suspendedAt).toBeNull();
    expect(after.suspendedAt).not.toBeNull();
  });

  it("unsuspend: clears suspendedAt + audits user.unsuspend", async () => {
    const res = await post(targetId, { suspended: false }, { token: f.adminToken });
    expect(res.status).toBe(200);
    const target = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(target.suspendedAt).toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { action: "user.unsuspend", targetId },
    });
    expect(audit).not.toBeNull();
  });

  it("429 after the admin-users limit (30/5min per admin)", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await post(targetId, {}, { token: f.adminToken }); // 400s still consume the limit
      expect(res.status).toBe(400);
    }
    const res = await post(targetId, { suspended: false }, { token: f.adminToken });
    expect(res.status).toBe(429);
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f, [targetId]);
    await prisma.$disconnect();
  });
});
