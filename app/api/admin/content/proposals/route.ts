import "server-only";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";

/**
 * GET /api/admin/content/proposals — GovernanceProposalContent list (+ comment
 * counts). NO create route: proposal content is citizen/route-created against
 * real on-chain proposalIds (the propose-embassy flow). NO delete in v1 —
 * deleting a row whose descriptionHash binds an on-chain proposal would orphan
 * the binding (recorded decision, plan Task B2).
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;
  const rows = await prisma.governanceProposalContent.findMany({
    include: { _count: { select: { comments: true } } },
    orderBy: { createdAt: "desc" },
  });
  return json({
    proposals: rows.map(({ _count, ...p }) => ({ ...p, commentCount: _count.comments })),
  });
}
