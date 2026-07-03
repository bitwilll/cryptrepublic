import "server-only";
import type { User } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { forbidden, tooManyRequests } from "@/lib/http/responses";

/**
 * The Wave-8 admin guard stack, centralized so every /api/admin route runs the
 * IDENTICAL order (constraint #2):
 *
 *   mutation: isAllowedOrigin → requireAdmin → rateLimit(per-admin userId key)
 *   GET:      requireAdmin (chain GETs add the per-admin rateLimit — they scan logs)
 *
 * Same-origin GETs are exempt from the origin check per the documented CSRF
 * posture (lib/auth/csrf.ts:3–10 — GET fetches may carry neither Origin nor
 * Referer). Rate-limit keys are ALWAYS per-admin userId, never IP.
 *
 * Returns the acting admin (+ the precomputed audit actor fields) or the
 * guard-stage Response verbatim — callers `if (x instanceof Response) return x;`.
 */

export interface AdminActor {
  user: User;
  actorLabel: string; // "admin:<email>" (falls back to the id for email-less admins)
  userAgent: string | null;
}

function actorOf(user: User, req: Request): AdminActor {
  return {
    user,
    actorLabel: `admin:${user.email ?? user.id}`,
    userAgent: req.headers.get("user-agent"),
  };
}

export interface AdminRateLimit {
  keyPrefix: string; // e.g. "admin-users" → key "admin-users:<adminId>"
  limit: number;
  windowMs: number;
}

export async function guardAdminMutation(
  req: Request,
  rl: AdminRateLimit,
): Promise<AdminActor | Response> {
  if (!isAllowedOrigin(req)) return forbidden();
  let user: User;
  try {
    ({ user } = await requireAdmin(req)); // throws unauthorized() / forbidden()
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const r = rateLimit(`${rl.keyPrefix}:${user.id}`, rl.limit, rl.windowMs);
  if (!r.ok) return tooManyRequests(r.retryAfterSec);
  return actorOf(user, req);
}

export async function guardAdminGet(
  req: Request,
  rl?: AdminRateLimit,
): Promise<AdminActor | Response> {
  let user: User;
  try {
    ({ user } = await requireAdmin(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  if (rl) {
    const r = rateLimit(`${rl.keyPrefix}:${user.id}`, rl.limit, rl.windowMs);
    if (!r.ok) return tooManyRequests(r.retryAfterSec);
  }
  return actorOf(user, req);
}

// Upper bound on `page` so a huge value never reaches Prisma as an
// out-of-range `skip` (a 500). With pageSize ≤ 100, skip ≤ 1e8 stays well
// inside the signed-32-bit range Prisma requires; 1e6 pages is far beyond any
// real admin list.
const MAX_PAGE = 1_000_000;

/** page 1..MAX_PAGE, 1 ≤ pageSize ≤ 100 (default 1 / 20); null = invalid → 400. */
export function parseListQuery(url: URL): { page: number; pageSize: number } | null {
  const pageRaw = url.searchParams.get("page") ?? "1";
  const sizeRaw = url.searchParams.get("pageSize") ?? "20";
  if (!/^\d+$/.test(pageRaw) || !/^\d+$/.test(sizeRaw)) return null;
  const page = Number(pageRaw);
  const pageSize = Number(sizeRaw);
  // Number.isSafeInteger rejects digit strings that overflow to Infinity/loss;
  // MAX_PAGE keeps the derived `skip` in Prisma's int range (audit hardening).
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) return null;
  if (pageSize < 1 || pageSize > 100) return null;
  return { page, pageSize };
}

/** Select-ALLOWLIST for admin user payloads (constraint #4) — NEVER passwordHash. */
export const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  kycStatus: true,
  suspendedAt: true,
  lockedUntil: true,
  failedLoginCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Session rows expose ONLY these five fields — NEVER tokenHash (constraint #4). */
export const SESSION_SELECT = {
  id: true,
  userAgent: true,
  ipHash: true,
  createdAt: true,
  expiresAt: true,
} as const;
