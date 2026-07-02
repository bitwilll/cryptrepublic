/**
 * Shared fixtures for the /api/admin route suites (Wave 9 group B). NOT a test
 * file — imported by the route.test.ts files beside each admin route.
 *
 * Seeds the three standard actors every admin route test needs:
 *   - an ADMIN (happy-path caller),
 *   - a plain USER (403-role case),
 *   - a SUSPENDED ADMIN whose session token was minted BEFORE suspension
 *     (401-suspended case — the A1 validateSessionToken choke point).
 *
 * Request builders mirror test/applications-route.test.ts (hand-built Request
 * objects — NO HTTP registration in unit tests).
 */
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export const APP = "http://localhost:3000";
export const PASS = "correct horse battery staple";

export interface AdminFixtures {
  adminId: string;
  adminEmail: string;
  adminToken: string;
  userId: string;
  userEmail: string;
  userToken: string;
  suspendedAdminId: string;
  suspendedAdminToken: string;
  allIds: string[];
}

export async function seedAdminFixtures(prefix: string): Promise<AdminFixtures> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const passwordHash = await hashPassword(PASS);
  const adminEmail = `${prefix}-admin-${suffix}@ex.org`;
  const userEmail = `${prefix}-user-${suffix}@ex.org`;
  const admin = await prisma.user.create({
    data: { email: adminEmail, passwordHash, role: "ADMIN" },
  });
  const user = await prisma.user.create({ data: { email: userEmail, passwordHash } });
  const suspendedAdmin = await prisma.user.create({
    data: { email: `${prefix}-susp-${suffix}@ex.org`, passwordHash, role: "ADMIN" },
  });
  const { token: adminToken } = await createSession(admin.id);
  const { token: userToken } = await createSession(user.id);
  // Token minted BEFORE suspension — proves the validateSessionToken choke point.
  const { token: suspendedAdminToken } = await createSession(suspendedAdmin.id);
  await prisma.user.update({
    where: { id: suspendedAdmin.id },
    data: { suspendedAt: new Date() },
  });
  return {
    adminId: admin.id,
    adminEmail,
    adminToken,
    userId: user.id,
    userEmail,
    userToken,
    suspendedAdminId: suspendedAdmin.id,
    suspendedAdminToken,
    allIds: [admin.id, user.id, suspendedAdmin.id],
  };
}

/** Deletes the fixture users (+ any extra ids) and every audit row they actored or targeted. */
export async function cleanupAdminFixtures(
  f: AdminFixtures,
  extraUserIds: string[] = [],
): Promise<void> {
  const ids = [...f.allIds, ...extraUserIds];
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorUserId: { in: ids } }, { targetId: { in: ids } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

export function adminGet(path: string, token?: string): Request {
  return new Request(APP + path, {
    method: "GET",
    headers: token ? { cookie: `cr_session=${token}` } : {},
  });
}

export function adminMutation(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  opts: { token?: string; origin?: string | null } = {},
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const origin = opts.origin === undefined ? APP : opts.origin;
  if (origin) headers.origin = origin;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(APP + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Asserts the serialized body of a Response (or any string) leaks no secret column. */
export function expectNoSecretKeys(serialized: string): void {
  if (serialized.includes("passwordHash") || serialized.includes("tokenHash")) {
    throw new Error(`secret key leaked into serialized payload: ${serialized.slice(0, 400)}`);
  }
}
