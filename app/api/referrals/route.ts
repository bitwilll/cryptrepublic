import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { activeChain } from "@/lib/config/chain";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { readHasPassportServer } from "@/lib/passport/serverReads";
import { canCreateReferral } from "@/lib/referrals/gate";
import { referralCreateSchema } from "@/lib/validation/referral";
import { json, badRequest, forbidden } from "@/lib/http/responses";

/**
 * POST /api/referrals — a CITIZEN creates a referral edge to a registered user
 * (named by email). This is ordinary product activity, NOT an admin mutation:
 * it uses isAllowedOrigin + requireSession (never guardAdminMutation) and
 * writes NO audit row — the Referral row IS the record (only the admin
 * allocate/trust routes audit).
 *
 * Gated by canCreateReferral (trust > 50 OR an available token; a token is
 * consumed ONLY when trust <= 50). Rejects self-referral, referring an
 * existing on-chain citizen (chain-truth), an unknown email, and a duplicate.
 * The create + conditional token decrement run in ONE transaction with a race
 * guard so a token can never go negative or be double-spent.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let referrerUserId: string;
  try {
    ({
      user: { id: referrerUserId },
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
  const parsed = referralCreateSchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const { referredEmail } = parsed.data;

  const referred = await prisma.user.findUnique({
    where: { email: referredEmail },
    select: { id: true },
  });
  if (!referred) return badRequest("No such user.");
  if (referred.id === referrerUserId) return badRequest("You cannot refer yourself.");

  const chainId = activeChain().primaryChainId;

  // Reject referring someone who is ALREADY an on-chain citizen (nonsensical —
  // they need no witnesses). Chain-truth, graceful on an unreachable chain.
  const referredAddress = await resolveApplicantAddress(referred.id);
  if (referredAddress) {
    let alreadyCitizen = false;
    try {
      alreadyCitizen = await readHasPassportServer(chainId, referredAddress);
    } catch {
      alreadyCitizen = false;
    }
    if (alreadyCitizen) return badRequest("That person is already a citizen.");
  }

  const gate = await canCreateReferral(chainId, referrerUserId);
  if (!gate.allowed) return badRequest(gate.reason);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.referral.create({
        data: { referrerUserId, referredUserId: referred.id, whenTokenConsumed: gate.viaToken },
      });
      if (gate.viaToken) {
        // Decrement ONLY on the token path, guarded so the balance can never go
        // negative — a race that emptied the balance since the gate read rejects.
        const res = await tx.user.updateMany({
          where: { id: referrerUserId, referralTokenBalance: { gt: 0 } },
          data: { referralTokenBalance: { decrement: 1 } },
        });
        if (res.count === 0) throw new Error("TOKEN_RACE");
      }
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      return badRequest("You have already referred this person.");
    }
    if (e instanceof Error && e.message === "TOKEN_RACE") {
      return badRequest("Your referral token was just used — try again.");
    }
    throw e;
  }

  return json({ ok: true });
}
