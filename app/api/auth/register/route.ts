import { z } from "zod";
import { registerSchema, normalizeEmail } from "@/lib/validation/auth";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import { prisma } from "@/lib/db";
import { getRegistrationPolicyServer } from "@/lib/flags/server";
import {
  json,
  badRequest,
  forbidden,
  tooManyRequests,
  withSessionCookie,
} from "@/lib/http/responses";

// Wave 17 — signup may carry a referral-link code (?ref= plumbed through the
// auth form). Under the OPEN policy an unknown or revoked code is SILENTLY
// ignored (registration must never fail because of a bad ref code); under
// REFERRAL_ONLY (Cabinet flag) a VALID code is REQUIRED, and under CLOSED no
// registration is accepted at all. Sign-in is never affected.
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

  const policy = await getRegistrationPolicyServer();
  if (policy === "CLOSED") {
    return json(
      { error: "Registrations are closed by order of the Cabinet. Sign-in remains open." },
      { status: 403 },
    );
  }
  const refCode = parsed.data.refCode?.trim() || undefined;
  const link = refCode ? await prisma.referralLink.findUnique({ where: { code: refCode } }) : null;
  const linkValid = link !== null && link.revokedAt === null;
  if (policy === "REFERRAL_ONLY" && !linkValid) {
    return json(
      {
        error:
          "Registration is by referral only — enter a valid referral code from a citizen of the Republic.",
      },
      { status: 403 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Enumeration-resistant: generic conflict, no confirmation of which email.
    return json({ error: "Unable to create the account." }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.passphrase);
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
    // user is brand new). The link was resolved above: under OPEN an invalid
    // code was silently ignored; under REFERRAL_ONLY it already gated the 403.
    // Re-check revocation INSIDE the transaction so a code revoked between the
    // policy gate and the write never binds an edge.
    if (link) {
      const fresh = await tx.referralLink.findUnique({ where: { id: link.id } });
      if (fresh && !fresh.revokedAt) {
        await tx.referral.create({
          data: {
            referrerUserId: fresh.ownerUserId,
            referredUserId: created.id,
            whenTokenConsumed: false,
            viaLinkId: fresh.id,
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
