import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { json } from "@/lib/http/responses";
import { citizenRefMap, excerpt } from "../lib";

/**
 * GET /api/community/conversations — the caller's ACTIVE memberships
 * (leftAt null), sorted by latest activity. DIRECT conversations are titled
 * with the peer's display; members carry { civicId, display } only. `unread`
 * counts messages from OTHERS newer than my lastReadAt.
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

  const memberships = await prisma.conversationMember.findMany({
    where: { userId, leftAt: null },
    include: {
      conversation: {
        include: {
          members: { where: { leftAt: null }, select: { userId: true } },
          messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
        },
      },
    },
  });

  const allMemberIds = memberships.flatMap((m) => m.conversation.members.map((x) => x.userId));
  const refs = await citizenRefMap(allMemberIds);

  const conversations = await Promise.all(
    memberships.map(async (m) => {
      const c = m.conversation;
      const last = c.messages[0] ?? null;
      const unread = await prisma.directMessage.count({
        where: {
          conversationId: c.id,
          senderUserId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      const peers = c.members.filter((x) => x.userId !== userId);
      const title =
        c.kind === "DIRECT"
          ? (refs.get(peers[0]?.userId ?? "")?.display ?? "Citizen")
          : (c.title ?? "Group");
      return {
        conversationId: c.id,
        kind: c.kind,
        title,
        mineIsCreator: c.creatorUserId === userId,
        members: c.members.map((x) => ({
          civicId: refs.get(x.userId)?.civicId ?? "",
          display: refs.get(x.userId)?.display ?? "Applicant",
          mine: x.userId === userId,
        })),
        lastMessage: last
          ? {
              excerpt: excerpt(last.body),
              at: last.createdAt.toISOString(),
              mine: last.senderUserId === userId,
            }
          : null,
        unread,
        lastActivityAt: (last?.createdAt ?? c.createdAt).toISOString(),
      };
    }),
  );

  conversations.sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));

  return json({ conversations });
}
