import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { groupCreateSchema } from "@/lib/validation/community";
import { normalizeCivicId } from "@/lib/identity/civicId";
import { acceptedConnectionUserIdsByCivicId } from "../lib";

/**
 * POST /api/community/groups — create a GROUP conversation. Every
 * memberCivicId must belong to an ACCEPTED connection of the creator; the
 * request fails 400 LISTING the Civic IDs that are not (unknown IDs land in
 * the same list — a group filing is not an existence oracle).
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
  const parsed = groupCreateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");

  const civicIds = [
    ...new Set(
      parsed.data.memberCivicIds.map((c) => normalizeCivicId(c)).filter((c): c is string => !!c),
    ),
  ];

  const connectedIds = await acceptedConnectionUserIdsByCivicId(userId, civicIds);
  const rejected = civicIds.filter((c) => !connectedIds.has(c));
  if (rejected.length > 0) {
    return badRequest(
      `These Civic IDs are not among your accepted connections: ${rejected.join(", ")}.`,
    );
  }

  const conversation = await prisma.conversation.create({
    data: {
      kind: "GROUP",
      title: parsed.data.title.trim(),
      creatorUserId: userId,
      members: {
        create: [
          { userId },
          ...[...connectedIds.values()].map((memberId) => ({
            userId: memberId,
            addedBy: userId,
          })),
        ],
      },
    },
    select: { id: true, title: true, kind: true, createdAt: true },
  });

  return json({
    ok: true,
    conversation: {
      conversationId: conversation.id,
      kind: conversation.kind,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
    },
  });
}
