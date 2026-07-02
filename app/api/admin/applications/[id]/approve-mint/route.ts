import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { approveMintSchema } from "@/lib/validation/admin";
import { buildAdminMintParams } from "@/lib/admin/mintParams";
import { readHasPassportServer } from "@/lib/passport/serverReads";
import { activeChain } from "@/lib/config/chain";

/**
 * POST /api/admin/applications/[id]/approve-mint — the Wave-10 admin-mint
 * OVERRIDE (witness-free issuance). Records OFF-CHAIN INTENT
 * (adminApprovedAt/adminApprovedBy) + returns the resolved mint params for the
 * client to feed into the PURE `prepareAdminMint` encoder — this route NEVER
 * signs, NEVER broadcasts, and NEVER writes a chain-cache column
 * (status/citizenTokenId/sealTxHash/sealedAt stay chain-derived; the `.strict()`
 * empty-body schema rejects any attempt by strictness).
 *
 * The mint `to` is TRUSTED, never client-supplied: buildAdminMintParams
 * resolves the applicant's verified LinkedWallet (resolveApplicantAddress) —
 * no verified wallet → 400, nothing written.
 *
 * Re-approval is an EVENT, not a toggle (trap #13): a second POST refreshes
 * adminApprovedAt/By and writes a FRESH audit row. An already-citizen `to` is
 * flagged (`alreadyCitizen: true` — adminMint would revert AlreadyCitizen) but
 * the approval intent is still recorded honestly.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-approve-mint",
    limit: 10,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  // Tolerate an EMPTY body (the action carries no fields) — but a malformed
  // JSON body is still a 400.
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    return badRequest();
  }
  const parsed = approveMintSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("approve-mint takes an empty body — the server resolves everything.");
  }

  const { id } = await params;
  const before = await prisma.citizenshipApplication.findUnique({ where: { id } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  let mintParams;
  try {
    mintParams = await buildAdminMintParams(before);
  } catch {
    // toBytes32String can throw for a >31-byte-after-slice multi-byte row (defensive).
    return badRequest("This application's motto/domicile cannot encode as bytes32.");
  }
  if (!mintParams) {
    return badRequest("This applicant has no verified wallet — adminMint needs a destination.");
  }

  // Chain-truth courtesy read (graceful — the default env has no registered
  // chain; never let an unreachable chain 500 the route).
  const chainId = activeChain().primaryChainId;
  let alreadyCitizen = false;
  try {
    alreadyCitizen = await readHasPassportServer(chainId, mintParams.to);
  } catch {
    alreadyCitizen = false;
  }

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.citizenshipApplication.update({
      where: { id },
      data: { adminApprovedAt: new Date(), adminApprovedBy: actor.user.id },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "application.approve_mint",
      targetType: "APPLICATION",
      targetId: id,
      before,
      after: updated,
      userAgent: actor.userAgent,
    });
    return updated;
  });

  return json({
    ok: true,
    alreadyCitizen,
    chainId,
    mintParams,
    application: {
      id: after.id,
      adminApprovedAt: after.adminApprovedAt,
      adminApprovedBy: after.adminApprovedBy,
    },
  });
}
