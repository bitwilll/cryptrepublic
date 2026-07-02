import "server-only";
import type { Session, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateSessionToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "cr_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CreateSessionOpts {
  userAgent?: string;
  ipHash?: string;
}

export async function createSession(userId: string, opts?: CreateSessionOpts) {
  const token = generateSessionToken();
  const session = await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      userAgent: opts?.userAgent,
      ipHash: opts?.ipHash,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return { token, session };
}

export async function validateSessionToken(
  token: string,
): Promise<{ session: Session; user: User } | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // SUSPEND CHOKE POINT (Wave 9): a suspended user has no valid session, ever.
  // Suspension already revoked all sessions transactionally; this covers any
  // session created in a race and gates getSession / getSessionFromRequest /
  // requireSession / requireAdmin at once. Do NOT delete the row here.
  if (session.user.suspendedAt) return null;
  const { user, ...rest } = session;
  return { session: rest as Session, user };
}

export async function revokeSessionToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
