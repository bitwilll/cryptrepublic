import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { proposalContentSchema } from "@/lib/validation/admin";

/**
 * /api/admin/content/proposals/[id] — detail (incl. comments, for the C3
 * moderation sub-list) + update.
 *
 * HASH-BOUND HONESTY (constraint #7): when the row's descriptionHash is set, a
 * BODY change is 400 — the body is bound to the on-chain descriptionHash
 * (keccak256 of the canonical content) and editing it would falsify the
 * binding. title/tag remain editable. descriptionHash itself is never
 * admin-editable (not in the schema).
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const { id } = await params;
  const proposal = await prisma.governanceProposalContent.findUnique({
    where: { id },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!proposal) return json({ error: "Not found." }, { status: 404 });
  const { comments, ...rest } = proposal;
  return json({ proposal: rest, comments });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-content",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = proposalContentSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the proposal fields.");

  const { id } = await params;
  const before = await prisma.governanceProposalContent.findUnique({ where: { id } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const bodyChanged = parsed.data.body !== undefined && parsed.data.body !== before.body;
  if (bodyChanged && before.descriptionHash !== null) {
    return badRequest("Body is bound to the on-chain descriptionHash.");
  }

  const after = await prisma.$transaction(async (tx) => {
    const row = await tx.governanceProposalContent.update({
      where: { id },
      data: {
        title: parsed.data.title,
        tag: parsed.data.tag,
        ...(bodyChanged ? { body: parsed.data.body } : {}),
      },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.proposal.update",
      targetType: "PROPOSAL_CONTENT",
      targetId: id,
      before,
      after: row,
      userAgent: actor.userAgent,
    });
    return row;
  });

  return json({ ok: true, proposal: after });
}
