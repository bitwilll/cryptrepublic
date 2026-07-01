import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";

export const MAX_FAILED = 5;
export const LOCK_MS = 15 * 60 * 1000;

// A lock is a TIME WINDOW, not a permanent state: isLocked() returns false once
// lockedUntil is in the past. The login route (Task 3) clears the counter when a lock
// has expired so a returning user gets a fresh window of MAX_FAILED attempts.
export function isLocked(user: Pick<User, "lockedUntil">, now: Date = new Date()): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
}

export async function registerFailedLogin(userId: string): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
  });
  if (user.failedLoginCount >= MAX_FAILED) {
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + LOCK_MS) },
    });
  }
}

export async function resetFailedLogins(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}
