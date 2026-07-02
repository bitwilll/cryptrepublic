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

/**
 * The configured host PLUS its `www.` twin (and vice versa). `www.<apex>` is the
 * same registrable domain under our control, and users genuinely land on it
 * (hit live on cryptrepublic.com: every mutation from www 403'd and the mint
 * flow surfaced "Could not save your attestation"). ONLY the www twin is
 * allowed — never arbitrary subdomains.
 */
function allowedHosts(): ReadonlySet<string> {
  const host = appHost();
  const twin = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  return new Set([host, twin]);
}

export function isAllowedOrigin(req: Request): boolean {
  const allowed = allowedHosts();
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return allowed.has(new URL(origin).host);
    } catch {
      return false;
    }
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return allowed.has(new URL(referer).host);
    } catch {
      return false;
    }
  }
  return false;
}
