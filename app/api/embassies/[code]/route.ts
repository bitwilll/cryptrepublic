import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";

/**
 * GET → one embassy's directory info + a LIVE per-city citizen count aggregated
 * from self-declared `CitizenshipApplication.domicileCity` over MINTED citizens
 * only (citizenTokenId != null — addendum #2), tagged self-declared. Honestly ~0
 * on a fresh chain. Never the mockup's fabricated `cit`/`events`.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const { code } = await params;
  if (!code) return badRequest();

  const embassy = await prisma.embassyDirectory.findUnique({ where: { code } });
  if (!embassy) {
    return json({ error: "Embassy not found." }, { status: 404 });
  }

  // Live per-city count: minted citizens only, self-declared domicile.
  const liveCitizenCount = await prisma.citizenshipApplication.count({
    where: { domicileCity: embassy.city, citizenTokenId: { not: null } },
  });

  return json({
    embassy,
    liveCitizenCount,
    liveCitizenCountSource: "self-declared domicile (minted citizens only)",
  });
}
