import "server-only";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/auth/ratelimit";
import { createSession } from "@/lib/auth/session";
import { json, tooManyRequests, withSessionCookie } from "@/lib/http/responses";

/**
 * GET /api/auth/qr/status?challengeId=… — device A polls. OPAQUE: pending |
 * approved | expired (unknown / expired / consumed all collapse to `expired` —
 * no existence oracle). On the WINNING `approved` poll it atomically consumes
 * the challenge (single-use), re-checks suspended at issuance, and sets the
 * session cookie ON THIS (device A's) response — device B never gets A's cookie.
 */
export async function GET(req: Request): Promise<Response> {
  const rl = rateLimit(`qr-status:${req.headers.get("x-forwarded-for") ?? "local"}`, 120, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const challengeId = new URL(req.url).searchParams.get("challengeId") ?? "";
  if (!challengeId) return json({ status: "expired" });

  const row = await prisma.walletLoginChallenge.findUnique({ where: { id: challengeId } });
  if (!row || row.expiresAt.getTime() <= Date.now()) return json({ status: "expired" });
  if (row.status === "pending") return json({ status: "pending" });
  if (row.status !== "approved" || !row.userId) return json({ status: "expired" }); // consumed / none

  // Winner-takes-all consume: approved → consumed. A losing/replayed poll → expired.
  const consumed = await prisma.walletLoginChallenge.updateMany({
    where: { id: row.id, status: "approved" },
    data: { status: "consumed", consumedAt: new Date() },
  });
  if (consumed.count === 0) return json({ status: "expired" });

  // Re-check suspended at the exact moment of issuance (validateSessionToken is
  // the ongoing choke point afterwards; this closes the issuance window).
  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { suspendedAt: true },
  });
  if (!user || user.suspendedAt) return json({ status: "expired" });

  const { token } = await createSession(row.userId, {
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return withSessionCookie(json({ status: "approved", next: "/dashboard" }), token);
}
