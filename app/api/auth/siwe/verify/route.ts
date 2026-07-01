import { siweVerifySchema } from "@/lib/validation/auth";
import { verifySiwe, SiweError } from "@/lib/auth/siwe";
import { createSession } from "@/lib/auth/session";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/ratelimit";
import {
  json,
  badRequest,
  forbidden,
  genericAuthError,
  tooManyRequests,
  withSessionCookie,
} from "@/lib/http/responses";

export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();
  const rl = rateLimit(`siwe:${req.headers.get("x-forwarded-for") ?? "local"}`, 20, 15 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = siweVerifySchema.safeParse(body);
  if (!parsed.success) return badRequest();

  let result;
  try {
    result = await verifySiwe(parsed.data.message, parsed.data.signature);
  } catch (e) {
    if (e instanceof SiweError) return genericAuthError();
    throw e;
  }

  const { token } = await createSession(result.user.id, {
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return withSessionCookie(json({ ok: true, address: result.address, next: "/dashboard" }), token);
}
