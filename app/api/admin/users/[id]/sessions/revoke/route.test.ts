// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
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
let otherId: string;
let otherSessionId: string;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
function post(id: string, body: unknown, opts: { token?: string; origin?: string | null } = {}) {
  return POST(
    adminMutation("POST", `/api/admin/users/${id}/sessions/revoke`, body, opts),
    params(id),
  );
}

describe("POST /api/admin/users/[id]/sessions/revoke", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-sess-revoke");
    const now = Date.now();
    const target = await prisma.user.create({
      data: { email: `adm-sess-target-${now}@ex.org` },
    });
    targetId = target.id;
    const other = await prisma.user.create({ data: { email: `adm-sess-other-${now}@ex.org` } });
    otherId = other.id;
    const { session } = await createSession(otherId);
    otherSessionId = session.id;
  });

  beforeEach(() => __resetRateLimit());

  it("401 / 403-role / 403-origin / 400-strict standard cases", async () => {
    expect((await post(targetId, { all: true })).status).toBe(401);
    expect((await post(targetId, { all: true }, { token: f.suspendedAdminToken })).status).toBe(
      401,
    );
    expect((await post(targetId, { all: true }, { token: f.userToken })).status).toBe(403);
    expect(
      (await post(targetId, { all: true }, { token: f.adminToken, origin: "https://evil.example" }))
        .status,
    ).toBe(403);
    expect((await post(targetId, { all: true, extra: 1 }, { token: f.adminToken })).status).toBe(
      400,
    );
    expect(
      (await post(targetId, { sessionId: "x", all: true }, { token: f.adminToken })).status,
    ).toBe(400);
  });

  it("404 for an unknown user id", async () => {
    expect((await post("nope", { all: true }, { token: f.adminToken })).status).toBe(404);
  });

  it("OWNERSHIP BINDING (addendum #1): a sessionId belonging to a DIFFERENT user → 404, nothing deleted, no audit row", async () => {
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: "user.sessions.revoke" },
    });
    const res = await post(targetId, { sessionId: otherSessionId }, { token: f.adminToken });
    expect(res.status).toBe(404);
    // The other user's session survives — deleteMany was pinned to {id, userId}.
    expect(await prisma.session.count({ where: { id: otherSessionId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "user.sessions.revoke" } })).toBe(
      auditCountBefore,
    );
  });

  it("single sessionId deletes EXACTLY one + audits with the allowlisted session (no tokenHash in beforeJson)", async () => {
    const { session: s1 } = await createSession(targetId, { userAgent: "UA-1" });
    await createSession(targetId, { userAgent: "UA-2" });
    expect(await prisma.session.count({ where: { userId: targetId } })).toBe(2);

    const res = await post(targetId, { sessionId: s1.id }, { token: f.adminToken });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; revoked: number };
    expect(body.revoked).toBe(1);
    expect(await prisma.session.count({ where: { userId: targetId } })).toBe(1);
    expect(await prisma.session.count({ where: { id: s1.id } })).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "user.sessions.revoke", targetId: s1.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.targetType).toBe("SESSION");
    // Assert on the RAW beforeJson string — the allowlist can never emit tokenHash.
    expectNoSecretKeys(audit!.beforeJson ?? "");
    const before = JSON.parse(audit!.beforeJson!) as { id: string; userAgent: string };
    expect(before.id).toBe(s1.id);
    expect(before.userAgent).toBe("UA-1");
  });

  it("{all:true} deletes all remaining sessions + audits targetType USER", async () => {
    await createSession(targetId);
    const res = await post(targetId, { all: true }, { token: f.adminToken });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; revoked: number };
    expect(body.revoked).toBe(2);
    expect(await prisma.session.count({ where: { userId: targetId } })).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "user.sessions.revoke", targetId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.targetType).toBe("USER");
    expectNoSecretKeys(audit!.beforeJson ?? "");
  });

  it("429 after the admin-users limit", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await post(targetId, {}, { token: f.adminToken })).status).toBe(400);
    }
    expect((await post(targetId, { all: true }, { token: f.adminToken })).status).toBe(429);
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f, [targetId, otherId]);
    await prisma.$disconnect();
  });
});
