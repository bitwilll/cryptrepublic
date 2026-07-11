import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { json } from "@/lib/http/responses";
import { getOrAssignCivicId } from "@/lib/identity/civicId";

/**
 * GET /api/community/me — the caller's own Civic ID (lazily assigned on this
 * first read — getOrAssignCivicId is the single assignment point) plus their
 * connection counters for the community screen. Session-gated; returns
 * nothing about any other citizen.
 */
export async function GET(req: Request): Promise<Response> {
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const civicId = await getOrAssignCivicId(userId);
  const [incoming, outgoing, accepted] = await Promise.all([
    prisma.citizenConnection.count({ where: { addresseeUserId: userId, status: "PENDING" } }),
    prisma.citizenConnection.count({ where: { requesterUserId: userId, status: "PENDING" } }),
    prisma.citizenConnection.count({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterUserId: userId }, { addresseeUserId: userId }],
      },
    }),
  ]);

  return json({ civicId, connectionCounts: { incoming, outgoing, accepted } });
}
