import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { connectionRespondSchema } from "@/lib/validation/community";
import { findOrCreateDirectConversation } from "../../lib";

/**
 * POST /api/community/connections/respond — accept / decline / remove.
 * - accept (addressee only, PENDING only): status → ACCEPTED and, IN THE SAME
 *   TRANSACTION, find-or-create the pair's DIRECT conversation.
 * - decline (addressee only, PENDING only): status → DECLINED.
 * - remove (either party, ACCEPTED only): status → REMOVED — the conversation
 *   is kept for the record but accepts no new messages.
 * A connection the caller is not party to answers 404 (no existence oracle).
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
  const parsed = connectionRespondSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");
  const { connectionId, action } = parsed.data;

  const connection = await prisma.citizenConnection.findUnique({ where: { id: connectionId } });
  if (
    !connection ||
    (connection.requesterUserId !== userId && connection.addresseeUserId !== userId)
  ) {
    return json({ error: "No such connection request." }, { status: 404 });
  }

  const now = new Date();

  if (action === "accept" || action === "decline") {
    if (connection.addresseeUserId !== userId) {
      return forbidden(); // only the addressee answers a request
    }
    if (connection.status !== "PENDING") {
      return json({ error: "That request has already been answered." }, { status: 409 });
    }
    if (action === "decline") {
      await prisma.citizenConnection.update({
        where: { id: connectionId },
        data: { status: "DECLINED", respondedAt: now },
      });
      return json({ ok: true, status: "DECLINED" });
    }
    const conversationId = await prisma.$transaction(async (tx) => {
      await tx.citizenConnection.update({
        where: { id: connectionId },
        data: { status: "ACCEPTED", respondedAt: now },
      });
      return findOrCreateDirectConversation(
        tx,
        connection.requesterUserId,
        connection.addresseeUserId,
      );
    });
    return json({ ok: true, status: "ACCEPTED", conversationId });
  }

  // remove — either party, on an ACCEPTED connection.
  if (connection.status !== "ACCEPTED") {
    return json({ error: "Only an accepted connection can be removed." }, { status: 409 });
  }
  await prisma.citizenConnection.update({
    where: { id: connectionId },
    data: { status: "REMOVED", respondedAt: now },
  });
  return json({ ok: true, status: "REMOVED" });
}
