import "server-only";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";

/**
 * PUBLIC GET /api/flags — the feature-flag map. NO auth (mirrors the public
 * stats routes): flags gate presentational UI, never secrets.
 *
 * Cache-Control: no-store — REQUIRED and test-pinned. Any freshness window
 * (e.g. max-age=30) makes flag flips invisible for its duration: the D2 admin
 * e2e flips a flag and IMMEDIATELY revisits /dashboard/population in the same
 * browser context, and a cached response would deterministically fail it. The
 * route is a single cheap DB read; caching buys nothing.
 *
 * NEVER throws (addendum #9): a DB failure returns 200 { flags: {} } — the
 * safe default posture; clients merge lib/flags DECLARED defaults.
 */
const NO_STORE = { "cache-control": "no-store" };

export async function GET(_req: Request): Promise<Response> {
  try {
    const rows = await prisma.featureFlag.findMany();
    const flags: Record<string, boolean> = {};
    for (const r of rows) flags[r.key] = r.enabled;
    return json({ flags }, { headers: NO_STORE });
  } catch {
    return json({ flags: {} }, { headers: NO_STORE });
  }
}
