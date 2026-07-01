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
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the form fields.");

  const email = normalizeEmail(parsed.data.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Enumeration-resistant: generic conflict, no confirmation of which email.
    return json({ error: "Unable to create the account." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.passphrase),
      application: { create: { status: "DRAFT", name: parsed.data.name } },
    },
  });

  const { token } = await createSession(user.id, {
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return withSessionCookie(json({ ok: true, next: "/dashboard/mint" }), token);
}
