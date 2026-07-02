import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { assetSchema } from "@/lib/validation/admin";

/**
 * /api/admin/content/assets — AssetCatalogEntry CRUD (collection). The FIRST
 * write path besides the seed. HONESTY (constraint #7): assetSchema rejects
 * fabricated on-chain provenance (/CR-L2|CryptRepublic L2|TITLED ON CHAIN/i —
 * the Wave-7 seed-scrub mirror). valueUsd/annualYieldUsd are BigInt columns —
 * decimal strings over the wire, converted at this boundary (JSON.stringify
 * throws on BigInt).
 */

function serializeAsset(a: {
  id: string;
  ref: string;
  kind: string;
  name: string;
  location: string;
  valueUsd: bigint;
  yieldBps: number;
  annualYieldUsd: bigint;
  status: string;
  acquiredAt: string;
}) {
  return { ...a, valueUsd: a.valueUsd.toString(), annualYieldUsd: a.annualYieldUsd.toString() };
}

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;
  const rows = await prisma.assetCatalogEntry.findMany({ orderBy: { ref: "asc" } });
  return json({ assets: rows.map(serializeAsset) });
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
  const parsed = assetSchema.safeParse(body);
  if (!parsed.success) {
    const provenance = parsed.error.issues.some((i) => i.message.includes("provenance"));
    return badRequest(
      provenance
        ? "Fabricated on-chain provenance is not allowed."
        : "Please check the asset fields.",
    );
  }
  const data = parsed.data;

  const existing = await prisma.assetCatalogEntry.findUnique({ where: { ref: data.ref } });
  if (existing) return badRequest("An asset with this ref already exists.");

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.assetCatalogEntry.create({
      data: {
        ...data,
        valueUsd: BigInt(data.valueUsd),
        annualYieldUsd: BigInt(data.annualYieldUsd),
      },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "content.asset.create",
      targetType: "ASSET",
      targetId: row.ref,
      after: row,
      userAgent: actor.userAgent,
    });
    return row;
  });

  return json({ ok: true, asset: serializeAsset(created) });
}
