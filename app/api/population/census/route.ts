import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { activeChain } from "@/lib/config/chain";
import { contractEntry } from "@/config/contracts";
import { prisma } from "@/lib/db";
import { readTotalCitizensServer } from "@/lib/passport/serverReads";
import { json } from "@/lib/http/responses";

/**
 * GET → the census:
 *  - `totalCitizens`: the TRUSTLESS live count from `totalCitizens()` (addendum
 *    #1: NEVER totalSupply(); null when the passport is unregistered).
 *  - `cities`: coords from `CityCensus` + a live per-city count aggregated from
 *    self-declared `CitizenshipApplication.domicileCity` over MINTED citizens
 *    only (citizenTokenId != null — addendum #2), plus the labeled SEEDED
 *    snapshot. The seeded snapshot is NEVER summed into the live total.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const chainId = activeChain().primaryChainId;

  let totalCitizens: string | null = null;
  if (contractEntry(chainId).passport) {
    try {
      totalCitizens = (await readTotalCitizensServer(chainId)).toString();
    } catch {
      totalCitizens = null;
    }
  }

  const cityRows = await prisma.cityCensus.findMany({ orderBy: { name: "asc" } });

  // Live per-city count: minted citizens only, grouped by self-declared domicile.
  const grouped = await prisma.citizenshipApplication.groupBy({
    by: ["domicileCity"],
    where: { citizenTokenId: { not: null }, domicileCity: { not: null } },
    _count: { _all: true },
  });
  const liveByCity = new Map<string, number>();
  for (const g of grouped) {
    if (g.domicileCity) liveByCity.set(g.domicileCity, g._count._all);
  }

  const cities = cityRows.map((c) => ({
    code: c.code,
    name: c.name,
    lat: c.lat,
    long: c.long,
    hasEmbassy: c.hasEmbassy,
    liveCount: liveByCity.get(c.name) ?? 0, // minted citizens, self-declared
    seededCount: c.seededCount, // SEEDED SNAPSHOT — demonstrative geography only
  }));

  return json({
    totalCitizens, // trustless live count (never derived from seeds)
    cities,
    liveCountSource: "self-declared domicile (minted citizens only)",
    seededNote: "seededCount is a demonstrative snapshot; never merged into totalCitizens",
  });
}
