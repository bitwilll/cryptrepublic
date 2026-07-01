import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/session";

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}
export function genericAuthError(): Response {
  return json({ error: "Invalid email or passphrase." }, { status: 401 });
}
export function badRequest(message = "Bad request."): Response {
  return json({ error: message }, { status: 400 });
}
export function tooManyRequests(retryAfterSec: number): Response {
  return json(
    { error: "Too many attempts. Try again later." },
    {
      status: 429,
      headers: { "retry-after": String(retryAfterSec) },
    },
  );
}
export function forbidden(): Response {
  return json({ error: "Forbidden." }, { status: 403 });
}
export function unauthorized(): Response {
  return json({ error: "Unauthorized." }, { status: 401 });
}

// --- Cookie helpers: emit Set-Cookie on the returned Response (works in the Vitest node env; Next honors it) ---
// The Set-Cookie string is built by hand (not sessionCookieOptions()) so it works with a
// bare Response in tests. In prod, `Secure` is added when NODE_ENV === "production".
export function withSessionCookie(res: Response, token: string): Response {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  const ttlSeconds = Math.floor(SESSION_TTL_MS / 1000);
  res.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${ttlSeconds}`,
  );
  return res;
}
export function clearSessionCookie(res: Response): Response {
  res.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0`);
  return res;
}
