import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { groupAddMemberSchema } from "@/lib/validation/community";
import { normalizeCivicId } from "@/lib/identity/civicId";
import { acceptedConnectionUserIdsByCivicId } from "../../lib";

/**
 * POST /api/community/groups/add — only the GROUP's creator may add, and only
 * citizens who are the creator's ACCEPTED connections (400 otherwise — the
 * same answer for an unknown Civic ID). Re-adding a member who left is
 * idempotent: their leftAt is cleared, history intact.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = groupAddMemberSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");

  const conversation = await prisma.conversation.findUnique({
    where: { id: parsed.data.conversationId },
    select: { id: true, kind: true, creatorUserId: true },
  });
  if (!conversation || conversation.kind !== "GROUP") {
    return badRequest("No such group.");
  }
  if (conversation.creatorUserId !== userId) return forbidden();

  const civicId = normalizeCivicId(parsed.data.civicId);
  if (!civicId) return badRequest("That is not a valid Civic ID (CR-XXXX-XXXX).");

  const connected = await acceptedConnectionUserIdsByCivicId(userId, [civicId]);
  const memberId = connected.get(civicId);
  if (!memberId) {
    return badRequest(`These Civic IDs are not among your accepted connections: ${civicId}.`);
  }

  const existing = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: conversation.id, userId: memberId } },
  });
  if (existing) {
    if (existing.leftAt !== null) {
      await prisma.conversationMember.update({
        where: { id: existing.id },
        data: { leftAt: null, addedBy: userId },
      });
    }
    return json({ ok: true, added: true });
  }

  await prisma.conversationMember.create({
    data: { conversationId: conversation.id, userId: memberId, addedBy: userId },
  });
  return json({ ok: true, added: true });
}
