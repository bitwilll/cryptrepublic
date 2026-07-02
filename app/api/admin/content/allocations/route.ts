import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { allocationSchema } from "@/lib/validation/admin";

/**
 * /api/admin/content/allocations — TreasuryAllocation CRUD (collection).
 *
 * SUM RULE (constraint #7 — mirrors CryptTreasury.setAllocation's
 * AllocationOverflow, CryptTreasury.sol:79–85): on create/update the table-wide
 * sum(targetBps) must stay ≤ 10000, computed INSIDE the transaction over all
 * OTHER rows + the incoming value. The bucket key pins /^[a-z0-9_]{1,32}$/
 * (schema) so the A3 bytes32 mapping stringToHex(bucket,{size:32}) can never
 * throw on a schema-valid row.
 */

const OVERFLOW_MSG = "Allocation targets exceed 100%.";

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;
  const allocations = await prisma.treasuryAllocation.findMany({ orderBy: { bucket: "asc" } });
  return json({ allocations });
}

export async function POST(req: Request): Promise<Response> {
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
  const parsed = allocationSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the allocation fields.");
  const data = parsed.data;

  const existing = await prisma.treasuryAllocation.findUnique({
    where: { bucket: data.bucket },
  });
  if (existing) return badRequest("An allocation with this bucket already exists.");

  try {
    const created = await prisma.$transaction(async (tx) => {
      const others = await tx.treasuryAllocation.aggregate({
        where: { bucket: { not: data.bucket } },
        _sum: { targetBps: true },
      });
      if ((others._sum.targetBps ?? 0) + data.targetBps > 10_000) {
        throw new Error(OVERFLOW_MSG);
      }
      const row = await tx.treasuryAllocation.create({ data });
      await writeAudit(tx, {
        actorUserId: actor.user.id,
        actorLabel: actor.actorLabel,
        action: "content.allocation.create",
        targetType: "ALLOCATION",
        targetId: row.bucket,
        after: row,
        userAgent: actor.userAgent,
      });
      return row;
    });
    return json({ ok: true, allocation: created });
  } catch (e) {
    if (e instanceof Error && e.message === OVERFLOW_MSG) return badRequest(OVERFLOW_MSG);
    throw e;
  }
}
