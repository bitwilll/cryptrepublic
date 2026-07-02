// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession, validateSessionToken } from "@/lib/auth/session";
import { requireSession, requireAdmin } from "@/lib/auth/guard";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { POST as login } from "@/app/api/auth/login/route";
import { setAdminRole } from "@/scripts/grant-admin";

const APP = "http://localhost:3000";
const PASS = "correct horse battery staple";

function reqWithCookie(cookieToken?: string) {
  return new Request(APP + "/api/admin/anything", {
    method: "GET",
    headers: cookieToken ? { cookie: `cr_session=${cookieToken}` } : {},
  });
}

function loginReq(email: string, passphrase: string) {
  return new Request(APP + "/api/auth/login", {
    method: "POST",
    headers: { origin: APP, "content-type": "application/json" },
    body: JSON.stringify({ email, passphrase }),
  });
}

async function thrownResponse(p: Promise<unknown>): Promise<Response> {
  try {
    await p;
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  throw new Error("expected a thrown Response, but the promise resolved");
}

const suffix = `${Date.now()}`;
const adminEmail = `admin-guard-a${suffix}@admin-guard.example`;
const userEmail = `admin-guard-u${suffix}@admin-guard.example`;
const suspendedEmail = `admin-guard-s${suffix}@admin-guard.example`;
const grantEmail = `admin-guard-g${suffix}@admin-guard.example`;

let adminId: string;
let userId: string;
let suspendedId: string;
let grantId: string;

describe("requireAdmin + suspend enforcement + grant-admin", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(PASS);
    const admin = await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: "ADMIN" },
    });
    const user = await prisma.user.create({ data: { email: userEmail, passwordHash } });
    const suspended = await prisma.user.create({ data: { email: suspendedEmail, passwordHash } });
    const grantee = await prisma.user.create({ data: { email: grantEmail, passwordHash } });
    adminId = admin.id;
    userId = user.id;
    suspendedId = suspended.id;
    grantId = grantee.id;
  });

  beforeEach(() => {
    __resetRateLimit();
  });

  describe("requireAdmin", () => {
    it("throws a 401 Response without a cookie", async () => {
      const res = await thrownResponse(requireAdmin(reqWithCookie()));
      expect(res.status).toBe(401);
    });

    it("throws a 403 Response for role USER", async () => {
      const { token } = await createSession(userId);
      const res = await thrownResponse(requireAdmin(reqWithCookie(token)));
      expect(res.status).toBe(403);
    });

    it("resolves {user} for role ADMIN", async () => {
      const { token } = await createSession(adminId);
      const s = await requireAdmin(reqWithCookie(token));
      expect(s.user.id).toBe(adminId);
      expect(s.user.role).toBe("ADMIN");
    });
  });

  describe("suspend choke point (validateSessionToken)", () => {
    it("nulls an existing session token and 401s requireSession once suspendedAt is set", async () => {
      const { token } = await createSession(suspendedId);
      // Pre-suspension the token is valid.
      expect(await validateSessionToken(token)).not.toBeNull();

      await prisma.user.update({
        where: { id: suspendedId },
        data: { suspendedAt: new Date() },
      });

      expect(await validateSessionToken(token)).toBeNull();
      const res = await thrownResponse(requireSession(reqWithCookie(token)));
      expect(res.status).toBe(401);
    });
  });

  describe("login route suspend rejection (enumeration-resistant)", () => {
    it("rejects a suspended user with the correct password via the GENERIC 401 body", async () => {
      await prisma.user.update({
        where: { id: suspendedId },
        data: { suspendedAt: new Date() },
      });
      const res = await login(loginReq(suspendedEmail, PASS));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Invalid email or passphrase." });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("still logs in a non-suspended control user (zero regression)", async () => {
      const res = await login(loginReq(userEmail, PASS));
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toContain("cr_session=");
    });
  });

  describe("setAdminRole (scripts/grant-admin.ts core)", () => {
    it("flips role to ADMIN and writes an allowlisted cli audit row", async () => {
      const out = await setAdminRole(grantEmail);
      expect(out.userId).toBe(grantId);
      expect(out.role).toBe("ADMIN");

      const user = await prisma.user.findUniqueOrThrow({ where: { id: grantId } });
      expect(user.role).toBe("ADMIN");

      const audit = await prisma.auditLog.findFirst({
        where: { targetId: grantId, action: "user.role.grant_admin" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).not.toBeNull();
      expect(audit!.actorLabel).toBe("cli");
      expect(audit!.actorUserId).toBeNull();
      expect(audit!.targetType).toBe("USER");
      // The snapshots parse and NEVER contain a secret key — hand-allowlisted in A1.
      const before = JSON.parse(audit!.beforeJson ?? "{}") as Record<string, unknown>;
      const after = JSON.parse(audit!.afterJson ?? "{}") as Record<string, unknown>;
      expect(Object.keys(before)).not.toContain("passwordHash");
      expect(Object.keys(after)).not.toContain("passwordHash");
      expect(before.role).toBe("USER");
      expect(after.role).toBe("ADMIN");
    });

    it("is idempotent: re-granting an existing ADMIN short-circuits with NO duplicate audit row", async () => {
      const countBefore = await prisma.auditLog.count({
        where: { targetId: grantId, action: "user.role.grant_admin" },
      });
      const out = await setAdminRole(grantEmail);
      expect(out.role).toBe("ADMIN");
      const countAfter = await prisma.auditLog.count({
        where: { targetId: grantId, action: "user.role.grant_admin" },
      });
      expect(countAfter).toBe(countBefore); // recorded decision: short-circuit, no audit noise
    });

    it("--revoke flips back to USER with the revoke action audited", async () => {
      const out = await setAdminRole(grantEmail, { revoke: true });
      expect(out.role).toBe("USER");
      const user = await prisma.user.findUniqueOrThrow({ where: { id: grantId } });
      expect(user.role).toBe("USER");
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: grantId, action: "user.role.revoke_admin" },
      });
      expect(audit).not.toBeNull();
      expect(audit!.actorLabel).toBe("cli");
    });

    it("rejects an unknown email", async () => {
      await expect(setAdminRole(`nobody-${suffix}@admin-guard.example`)).rejects.toThrow(
        /No user/i,
      );
    });
  });

  afterAll(async () => {
    const ids = [adminId, userId, suspendedId, grantId].filter(Boolean);
    await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
});
