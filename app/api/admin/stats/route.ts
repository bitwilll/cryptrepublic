import "server-only";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { APP_STATUS_ORDER } from "@/lib/applications/state";
import { activeChain } from "@/lib/config/chain";
import { readTotalCitizensServer } from "@/lib/passport/serverReads";

const AUDIT_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * GET /api/admin/stats — the Overview infographics data (Wave 10 C2). HONESTY
 * CONTRACT (constraint: never fabricate):
 *  - counts.citizens comes from the chain (totalCitizens()) or is NULL with
 *    chainAvailable:false — the default env has no registered chain and the
 *    graceful catch must never 500 the route (plan note #8: there is NO
 *    passportAvailable probe; the catch IS the probe).
 *  - auditActivity buckets the last 14 UTC days with EMPTY DAYS PRESENT as 0
 *    (a flat honest series, not a cropped one).
 *  - censusByCity is CityCensus.seededCount → censusSource:"seeded" so the UI
 *    MUST label it demonstrative; it is never merged with live citizen data.
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req, {
    keyPrefix: "admin-stats",
    limit: 30,
    windowMs: 60_000,
  });
  if (actor instanceof Response) return actor;

  const since = new Date(Date.now() - (AUDIT_WINDOW_DAYS - 1) * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);

  const [appGroups, users, embassies, censusRows, auditRows] = await Promise.all([
    prisma.citizenshipApplication.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.count(),
    prisma.embassyDirectory.count(),
    prisma.cityCensus.findMany({
      select: { code: true, name: true, seededCount: true },
      orderBy: { seededCount: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  const applicationsByStatus = APP_STATUS_ORDER.map((status) => ({
    status,
    count: appGroups.find((g) => g.status === status)?._count._all ?? 0,
  }));

  // Bucket by UTC ISO day in JS (SQLite has no clean date_trunc via Prisma
  // groupBy) — every day in the window is present, empty days as 0.
  const buckets = new Map<string, number>();
  for (let i = AUDIT_WINDOW_DAYS - 1; i >= 0; i--) {
    buckets.set(new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10), 0);
  }
  for (const r of auditRows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    const n = buckets.get(day);
    if (n !== undefined) buckets.set(day, n + 1);
  }
  const auditActivity = [...buckets.entries()].map(([day, count]) => ({ day, count }));

  // Chain-truth citizens count — NULL (not 0, not a guess) when unreadable.
  const chainId = activeChain().primaryChainId;
  let citizens: number | null = null;
  let chainAvailable = false;
  try {
    citizens = Number(await readTotalCitizensServer(chainId));
    chainAvailable = true;
  } catch {
    citizens = null;
    chainAvailable = false;
  }

  return json({
    applicationsByStatus,
    counts: { users, citizens, embassies },
    chainAvailable,
    auditActivity,
    censusByCity: censusRows.map((r) => ({ code: r.code, name: r.name, count: r.seededCount })),
    censusSource: "seeded" as const,
  });
}
