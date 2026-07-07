import "server-only";
import { prisma } from "@/lib/db";

/**
 * Public trader display names (Wave 15 store). A user with a SEALED passport
 * shows as "Citizen № <tokenId>" via the CACHED
 * CitizenshipApplication.citizenTokenId (no chain call — same cached read the
 * census/embassy routes use); everyone else shows as "Applicant". Never an
 * email or a wallet address — those stay private to the Registry.
 */
export async function traderDisplayMap(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return map;
  for (const id of unique) map.set(id, "Applicant");
  const apps = await prisma.citizenshipApplication.findMany({
    where: { userId: { in: unique }, citizenTokenId: { not: null } },
    select: { userId: true, citizenTokenId: true },
  });
  for (const a of apps) {
    if (a.citizenTokenId) map.set(a.userId, `Citizen № ${a.citizenTokenId}`);
  }
  return map;
}

export async function traderDisplay(userId: string): Promise<string> {
  const map = await traderDisplayMap([userId]);
  return map.get(userId) ?? "Applicant";
}
