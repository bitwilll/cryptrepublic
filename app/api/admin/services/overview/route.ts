import "server-only";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";

/**
 * GET /api/admin/services/overview (Wave 15 C) — programme statistics for the
 * services desk: insurance applications by status, store listings by status,
 * commissary interest per item (top 10), and the number of ACTIVE BitWill
 * directives.
 *
 * PRIVACY INVARIANT (test-enforced): directives are private instruments — the
 * desk sees a COUNT ONLY. No beneficiary name/contact/address, memo, hash, or
 * signature ever leaves this route.
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const [insuranceByStatus, listingsByStatus, commissaryTop, bitwillActiveCount] =
    await Promise.all([
      prisma.insuranceApplication.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.storeListing.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.commissaryInterest.groupBy({
        by: ["itemId"],
        _count: { _all: true },
        orderBy: { _count: { itemId: "desc" } },
        take: 10,
      }),
      prisma.bitwillDirective.count({ where: { status: "ACTIVE" } }),
    ]);

  return json({
    insurance: Object.fromEntries(insuranceByStatus.map((g) => [g.status, g._count._all])),
    listings: Object.fromEntries(listingsByStatus.map((g) => [g.status, g._count._all])),
    commissary: commissaryTop.map((g) => ({ itemId: g.itemId, count: g._count._all })),
    bitwill: { activeCount: bitwillActiveCount },
  });
}
