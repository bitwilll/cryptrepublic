import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { prisma } from "@/lib/db";
import { sealConfirmSchema } from "@/lib/validation/mint";
import { canTransition, type AppStatus } from "@/lib/applications/state";
import { json, badRequest, forbidden } from "@/lib/http/responses";

/**
 * POST → RECORD the sealed mint result. The client has ALREADY signed + sent the
 * `mintWithWitnesses` tx from its OWN wallet (lib/passport/mint.ts); this route
 * only records the outcome. It NEVER signs or sends anything.
 *
 * DOCUMENTED CACHE: `sealTxHash`/`citizenTokenId` are a CLIENT-REPORTED cache.
 * "Your Passport" (PassportView) ALWAYS reconciles against the chain via
 * `readPassportStatus`, so a lying/stale cache cannot fabricate a passport.
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
  const parsed = sealConfirmSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid seal confirmation.");

  const existing = await prisma.citizenshipApplication.findUnique({
    where: { userId },
    select: { status: true },
  });
  const from = (existing?.status as AppStatus | undefined) ?? "DRAFT";
  if (!canTransition(from, "SEALED")) {
    return badRequest("You must collect all witnesses before sealing.");
  }

  const application = await prisma.citizenshipApplication.update({
    where: { userId },
    data: {
      status: "SEALED",
      sealTxHash: parsed.data.txHash,
      citizenTokenId: parsed.data.tokenId,
      sealedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      sealTxHash: true,
      citizenTokenId: true,
      sealedAt: true,
    },
  });
  return json({ ok: true, application });
}
