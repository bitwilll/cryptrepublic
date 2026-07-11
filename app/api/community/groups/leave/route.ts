import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";

const leaveSchema = z.object({ conversationId: z.string().min(1).max(64) }).strict();

/**
 * POST /api/community/groups/leave — set MY leftAt on a GROUP conversation.
 * Any member may leave, including the creator — a creator leaving does NOT
 * delete the group; the remaining members keep talking. DIRECT conversations
 * cannot be left (remove the connection instead).
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
  const parsed = leaveSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");

  const membership = await prisma.conversationMember.findFirst({
    where: { conversationId: parsed.data.conversationId, userId, leftAt: null },
    include: { conversation: { select: { kind: true } } },
  });
  if (!membership) return forbidden();
  if (membership.conversation.kind !== "GROUP") {
    return badRequest("Only a group can be left — remove the connection instead.");
  }

  await prisma.conversationMember.update({
    where: { id: membership.id },
    data: { leftAt: new Date() },
  });
  return json({ ok: true, left: true });
}
