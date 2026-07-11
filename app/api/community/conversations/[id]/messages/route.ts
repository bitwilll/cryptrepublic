import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { json, forbidden } from "@/lib/http/responses";
import { activeMembership, citizenRefMap } from "../../../lib";

const PAGE_SIZE = 50;

/**
 * GET /api/community/conversations/[id]/messages?cursor= — member-only (403
 * for outsiders AND for members who left; the same answer as for an unknown
 * conversation, so ids cannot be probed). Newest 50 with a cursor, senders as
 * { civicId, display, mine }. Reading marks my lastReadAt = now.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const { id: conversationId } = await params;
  const membership = await activeMembership(conversationId, userId);
  if (!membership) return forbidden();

  const cursor = new URL(req.url).searchParams.get("cursor");
  const rows = await prisma.directMessage.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, PAGE_SIZE);
  const nextCursor = rows.length > PAGE_SIZE ? page[page.length - 1]!.id : null;

  const refs = await citizenRefMap(page.map((m) => m.senderUserId));

  await prisma.conversationMember.update({
    where: { id: membership.id },
    data: { lastReadAt: new Date() },
  });

  return json({
    messages: page.map((m) => ({
      id: m.id,
      body: m.body,
      at: m.createdAt.toISOString(),
      sender: {
        civicId: refs.get(m.senderUserId)?.civicId ?? "",
        display: refs.get(m.senderUserId)?.display ?? "Applicant",
        mine: m.senderUserId === userId,
      },
    })),
    nextCursor,
  });
}
