import "server-only";

// ─────────────────────────────────────────────────────────────────────────────
// CSRF POSTURE (Wave 2)
// Defence is two-layered: (1) the cr_session cookie is SameSite=Lax, so browsers do
// not attach it to cross-site sub-requests (form posts / fetches) triggered by a
// third-party origin; (2) EVERY state-changing (POST) route additionally calls
// isAllowedOrigin(req) below, rejecting any request whose Origin (or, absent that,
// Referer) host does not match our own APP_URL host. Same-origin GETs are exempt.
// ─────────────────────────────────────────────────────────────────────────────

function appHost(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  try {
    return new URL(url).host;
  } catch {
    return "localhost:3000";
  }
}

export function isAllowedOrigin(req: Request): boolean {
  const allowed = appHost();
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === allowed;
    } catch {
      return false;
    }
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === allowed;
    } catch {
      return false;
    }
  }
  return false;
}
