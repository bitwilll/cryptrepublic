import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { assetSchema } from "@/lib/validation/admin";

/**
 * /api/admin/content/assets/[ref] — item update/delete. PUT takes the FULL
 * assetSchema; the body's `ref` must equal the path ref (no renames — keeps
 * the audit target stable). Updates audit BOTH before and after; deletes
 * preserve before only.
 */

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ ref: string }> },
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
  const parsed = assetSchema.safeParse(body);
  if (!parsed.success) {
    const provenance = parsed.error.issues.some((i) => i.message.includes("provenance"));
    return badRequest(
      provenance
        ? "Fabricated on-chain provenance is not allowed."
        : "Please check the asset fields.",
    );
  }
  const { ref } = await params;
  if (parsed.data.ref !== ref) return badRequest("The body ref must match the path ref.");

  const before = await prisma.assetCatalogEntry.findUnique({ where: { ref } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  const after = await prisma.$transaction(async (tx) => {
    const row = await tx.assetCatalogEntry.update({
      where: { ref },
      data: {
        ...parsed.data,
        valueUsd: BigInt(parsed.data.valueUsd),
        annualYieldUsd: BigInt(parsed.data.annualYieldUsd),
      },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.asset.update",
      targetType: "ASSET",
      targetId: ref,
      before,
      after: row,
      userAgent: actor.userAgent,
    });
    return row;
  });

  return json({
    ok: true,
    asset: {
      ...after,
      valueUsd: after.valueUsd.toString(),
      annualYieldUsd: after.annualYieldUsd.toString(),
    },
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-content",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  const { ref } = await params;
  const before = await prisma.assetCatalogEntry.findUnique({ where: { ref } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.assetCatalogEntry.delete({ where: { ref } });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.asset.delete",
      targetType: "ASSET",
      targetId: ref,
      before,
      userAgent: actor.userAgent,
    });
  });

  return json({ ok: true });
}
