import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { messageSchema } from "@/lib/validation/community";
import { activeMembership } from "../lib";

/**
 * POST /api/community/messages — send a message. Member-only (403). For a
 * DIRECT conversation the underlying connection must still be ACCEPTED —
 * a REMOVED/DECLINED pair keeps its history but accepts no new messages
 * (403). The body is stored VERBATIM as plain text (1..2000 chars); the UI
 * renders text only — no markdown, no HTML.
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
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");

  const membership = await activeMembership(parsed.data.conversationId, userId);
  if (!membership) return forbidden();

  if (membership.conversation.kind === "DIRECT") {
    const peer = await prisma.conversationMember.findFirst({
      where: { conversationId: membership.conversationId, userId: { not: userId } },
      select: { userId: true },
    });
    const live = peer
      ? await prisma.citizenConnection.findFirst({
          where: {
            status: "ACCEPTED",
            OR: [
              { requesterUserId: userId, addresseeUserId: peer.userId },
              { requesterUserId: peer.userId, addresseeUserId: userId },
            ],
          },
          select: { id: true },
        })
      : null;
    if (!live) {
      return json(
        { error: "This connection is no longer active — no new messages can be sent." },
        { status: 403 },
      );
    }
  }

  const message = await prisma.directMessage.create({
    data: {
      conversationId: parsed.data.conversationId,
      senderUserId: userId,
      body: parsed.data.body,
    },
  });

  return json({
    ok: true,
    message: { id: message.id, body: message.body, at: message.createdAt.toISOString() },
  });
}
