import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOrAssignCivicId } from "@/lib/identity/civicId";
import { traderDisplayMap } from "@/lib/store/display";

/**
 * Shared helpers for the community vertical (Wave 17 — Civic ID, connections,
 * messaging). PRIVACY IS THE FEATURE: every citizen-facing payload built from
 * these helpers identifies citizens by { civicId, display } ONLY — never an
 * email, userId, or wallet address.
 */

export interface CitizenRef {
  civicId: string;
  display: string;
}

/**
 * Resolve a set of userIds to their public { civicId, display } refs.
 * Civic IDs are lazily assigned (getOrAssignCivicId) so a peer who has never
 * opened the community screen still resolves; display is the census-public
 * "Citizen № N" (cached tokenId) or "Applicant" — never a name or email.
 */
export async function citizenRefMap(userIds: string[]): Promise<Map<string, CitizenRef>> {
  const map = new Map<string, CitizenRef>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return map;
  const [users, displays] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, civicId: true } }),
    traderDisplayMap(unique),
  ]);
  for (const u of users) {
    const civicId = u.civicId ?? (await getOrAssignCivicId(u.id));
    map.set(u.id, { civicId, display: displays.get(u.id) ?? "Applicant" });
  }
  return map;
}

/** The caller's ACTIVE membership in a conversation, or null (left/never joined). */
export async function activeMembership(conversationId: string, userId: string) {
  return prisma.conversationMember.findFirst({
    where: { conversationId, userId, leftAt: null },
    include: { conversation: true },
  });
}

/**
 * Find or create the single DIRECT conversation for a pair of citizens.
 * Runs on a transaction client so connection acceptance and conversation
 * creation commit atomically.
 */
export async function findOrCreateDirectConversation(
  tx: Prisma.TransactionClient,
  userIdA: string,
  userIdB: string,
): Promise<string> {
  const existing = await tx.conversation.findFirst({
    where: {
      kind: "DIRECT",
      AND: [{ members: { some: { userId: userIdA } } }, { members: { some: { userId: userIdB } } }],
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.conversation.create({
    data: {
      kind: "DIRECT",
      members: { create: [{ userId: userIdA }, { userId: userIdB }] },
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Resolve civicIds → userIds, keeping ONLY those that are ACCEPTED
 * connections of `userId`. Returns a map civicId → peer userId; a civicId
 * that is unknown OR merely un-connected is simply absent — callers list the
 * missing ids in one 400 so a group filing is never an existence oracle.
 */
export async function acceptedConnectionUserIdsByCivicId(
  userId: string,
  civicIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (civicIds.length === 0) return map;
  const users = await prisma.user.findMany({
    where: { civicId: { in: civicIds } },
    select: { id: true, civicId: true },
  });
  if (users.length === 0) return map;
  const accepted = await prisma.citizenConnection.findMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterUserId: userId, addresseeUserId: { in: users.map((u) => u.id) } },
        { addresseeUserId: userId, requesterUserId: { in: users.map((u) => u.id) } },
      ],
    },
    select: { requesterUserId: true, addresseeUserId: true },
  });
  const connectedUserIds = new Set(
    accepted.map((c) => (c.requesterUserId === userId ? c.addresseeUserId : c.requesterUserId)),
  );
  for (const u of users) {
    if (u.civicId && connectedUserIds.has(u.id)) map.set(u.civicId, u.id);
  }
  return map;
}

/** Trim a message body to a short list excerpt. */
export function excerpt(body: string, max = 120): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}
