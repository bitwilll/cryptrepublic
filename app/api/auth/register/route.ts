import { z } from "zod";
import { registerSchema, normalizeEmail } from "@/lib/validation/auth";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { prisma } from "@/lib/db";
import {
  json,
  badRequest,
  forbidden,
  tooManyRequests,
  withSessionCookie,
} from "@/lib/http/responses";

// Wave 17 — signup may carry an OPTIONAL referral-link code (?ref= plumbed
// through the auth form). An unknown or revoked code is SILENTLY ignored:
// registration must never fail because of a bad ref code.
const registerWithRefSchema = registerSchema.extend({
  refCode: z.string().max(32).optional(),
});

export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();
  const rl = rateLimit(
    `register:${req.headers.get("x-forwarded-for") ?? "local"}`,
    10,
    15 * 60_000,
  );
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = registerWithRefSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form fields.");

  const email = normalizeEmail(parsed.data.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Enumeration-resistant: generic conflict, no confirmation of which email.
    return json({ error: "Unable to create the account." }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.passphrase);
  const refCode = parsed.data.refCode;
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash,
        application: { create: { status: "DRAFT", name: parsed.data.name } },
      },
    });
    // Wave 17 — bind a ?ref= signup to the link owner as a Referral edge, in
    // the SAME transaction as the user row. Self/duplicate are impossible (the
    // user is brand new); unknown/revoked codes are silently ignored.
    if (refCode) {
      const link = await tx.referralLink.findUnique({ where: { code: refCode } });
      if (link && !link.revokedAt) {
        await tx.referral.create({
          data: {
            referrerUserId: link.ownerUserId,
            referredUserId: created.id,
            whenTokenConsumed: false,
            viaLinkId: link.id,
          },
        });
      }
    }
    return created;
  });

  const { token } = await createSession(user.id, {
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return withSessionCookie(json({ ok: true, next: "/dashboard/mint" }), token);
}
