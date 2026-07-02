import "server-only";
import { cookies } from "next/headers";
import type { Session, User } from "@prisma/client";
import { SESSION_COOKIE, validateSessionToken } from "./session";
import { forbidden, unauthorized } from "@/lib/http/responses";

// Server Components ONLY (next/headers throws outside a request scope, e.g. the Vitest node env).
export async function getSession(): Promise<{ session: Session; user: User } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

// Route handlers: read + validate the cr_session token from the request's Cookie header.
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export async function getSessionFromRequest(
  req: Request,
): Promise<{ session: Session; user: User } | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  return validateSessionToken(token);
}

export async function requireSession(req: Request): Promise<{ session: Session; user: User }> {
  const s = await getSessionFromRequest(req);
  if (!s) throw unauthorized();
  return s;
}

/** requireSession + role gate. Throws unauthorized() (no/invalid session — incl.
 *  suspended users, nulled by validateSessionToken) or forbidden() (role !== "ADMIN"). */
export async function requireAdmin(req: Request): Promise<{ session: Session; user: User }> {
  const s = await requireSession(req); // throws unauthorized()
  if (s.user.role !== "ADMIN") throw forbidden();
  return s;
}
