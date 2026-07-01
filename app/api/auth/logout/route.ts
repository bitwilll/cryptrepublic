import { SESSION_COOKIE, revokeSessionToken } from "@/lib/auth/session";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, forbidden, clearSessionCookie } from "@/lib/http/responses";

// Dependency-free cookie read (no next/headers) — mirrors the reader in lib/auth/guard.ts.
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await revokeSessionToken(token);
  return clearSessionCookie(json({ ok: true }));
}
