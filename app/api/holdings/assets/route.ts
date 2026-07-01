import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";

/**
 * GET → the seeded asset register (off-chain by nature) + computed composition
 * and totals. The totals are a SEEDED/DEMONSTRATIVE register sum — NOT a live
 * on-chain valuation (constraint #5 / §7.10). The response is explicitly tagged
 * `seeded:true` so the UI renders the AUM hero behind a visible SEEDED tag.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const rows = await prisma.assetCatalogEntry.findMany({ orderBy: { ref: "asc" } });

  const assets = rows.map((a) => ({
    ref: a.ref,
    kind: a.kind,
    name: a.name,
    location: a.location,
    valueUsd: a.valueUsd.toString(),
    yieldBps: a.yieldBps,
    annualYieldUsd: a.annualYieldUsd.toString(),
    status: a.status,
    acquiredAt: a.acquiredAt,
  }));

  const totalValueUsd = rows.reduce((s, a) => s + a.valueUsd, 0n);
  const totalAnnualYieldUsd = rows.reduce((s, a) => s + a.annualYieldUsd, 0n);

  // Composition by kind (share of total value).
  const byKind: Record<string, bigint> = {};
  for (const a of rows) byKind[a.kind] = (byKind[a.kind] ?? 0n) + a.valueUsd;
  const composition = Object.entries(byKind).map(([kind, value]) => ({
    kind,
    valueUsd: value.toString(),
    shareBps: totalValueUsd > 0n ? Number((value * 10_000n) / totalValueUsd) : 0,
  }));

  return json({
    assets,
    totalValueUsd: totalValueUsd.toString(),
    totalAnnualYieldUsd: totalAnnualYieldUsd.toString(),
    composition,
    seeded: true, // DEMONSTRATIVE register — not a live on-chain valuation
  });
}
