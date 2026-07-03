import "server-only";
import { getAddress } from "viem";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { prisma } from "@/lib/db";
import { activeChain } from "@/lib/config/chain";
import { passportAddress } from "@/config/contracts";
import { witnessSubmitSchema } from "@/lib/validation/mint";
import { recoverWitness } from "@/lib/passport/attestation";
import { readHasPassportServer, readRequiredWitnessesServer } from "@/lib/passport/serverReads";
import { resolveUserByWalletAddress, referralExists } from "@/lib/referrals/lookup";
import { json, badRequest, forbidden } from "@/lib/http/responses";

/**
 * POST → validate + store ONE witness signature.
 *
 * Rejects (all mirror on-chain `mintWithWitnesses` invariants):
 *  - `attestation.applicant` !== the application's recorded applicant (applicant-binding)
 *  - `attestation.nonce`/`deadline` !== the application's current request (stale sig)
 *  - recovered witness === applicant (self-attest)
 *  - recovered witness is not a citizen (`!hasPassport`)
 *  - duplicate `(applicationId, witnessAddress)`
 *
 * When the count reaches `requiredWitnesses`, transitions OATH_ACCEPTED → WITNESSED.
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
  const parsed = witnessSubmitSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid witness submission.");
  const { attestation, signature } = parsed.data;

  const application = await prisma.citizenshipApplication.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true, // Wave 12: needed to check Referral(referrer=witness, referred=applicant)
      status: true,
      applicantAddress: true,
      witnessNonce: true,
      witnessDeadline: true,
    },
  });
  if (!application || !application.applicantAddress || !application.witnessNonce) {
    return badRequest("Request witnesses before submitting signatures.");
  }

  // Applicant-binding: a witness may ONLY sign for THIS application's applicant.
  if (getAddress(attestation.applicant) !== getAddress(application.applicantAddress)) {
    return badRequest("This signature is for a different applicant.");
  }
  // Stale-sig: nonce/deadline must match the current outstanding request.
  if (
    attestation.nonce !== application.witnessNonce ||
    attestation.deadline !== application.witnessDeadline
  ) {
    return badRequest("This attestation is stale — request a fresh one.");
  }

  const chainId = activeChain().primaryChainId;

  // Recover the witness from the EIP-712 signature.
  let witnessAddress: `0x${string}`;
  try {
    witnessAddress = await recoverWitness(
      chainId,
      passportAddress(chainId),
      {
        applicant: getAddress(attestation.applicant),
        nameHash: attestation.nameHash as `0x${string}`,
        nonce: BigInt(attestation.nonce),
        deadline: BigInt(attestation.deadline),
      },
      signature as `0x${string}`,
    );
  } catch {
    return badRequest("Could not recover the witness from this signature.");
  }

  // No self-attestation.
  if (getAddress(witnessAddress) === getAddress(application.applicantAddress)) {
    return badRequest("A witness may not attest to their own application.");
  }

  // Witness must be an existing citizen.
  let isCitizen: boolean;
  try {
    isCitizen = await readHasPassportServer(chainId, witnessAddress);
  } catch {
    return badRequest("Passport contract is not reachable on this chain.");
  }
  if (!isCitizen) {
    return badRequest("Only existing citizens may witness a new citizen.");
  }

  // Wave 12 — REFERRAL-GATED ATTESTATION: a witness may only attest for an
  // applicant they REFERRED. The witness is known ONLY as the recovered
  // `witnessAddress` (crypto-bound, never a session/body field); map it back to
  // a User via a VERIFIED LinkedWallet, then require a Referral(referrer=that
  // user, referred=this applicant). A rejected witness persists NO row, so the
  // `collected >= required → WITNESSED` transition below needs no change.
  // (The Wave-10 admin-mint OVERRIDE collects zero witnesses and never reaches
  // this route — it is deliberately exempt from the gate.)
  const referrerUserId = await resolveUserByWalletAddress(getAddress(witnessAddress));
  if (!referrerUserId || !(await referralExists(referrerUserId, application.userId))) {
    return badRequest("You may only attest for applicants you have referred.");
  }

  // Store the signature; the unique index enforces no-duplicate-witness.
  try {
    await prisma.witnessSignature.create({
      data: {
        applicationId: application.id,
        witnessAddress: getAddress(witnessAddress),
        signature,
        nonce: attestation.nonce,
        deadline: attestation.deadline,
      },
    });
  } catch {
    // Unique violation → this witness already signed.
    return badRequest("This witness has already signed your application.");
  }

  const collected = await prisma.witnessSignature.count({
    where: { applicationId: application.id },
  });
  const required = await readRequiredWitnessesServer(chainId);

  if (collected >= required && application.status === "OATH_ACCEPTED") {
    await prisma.citizenshipApplication.update({
      where: { userId },
      data: { status: "WITNESSED" },
    });
  }

  return json({ ok: true, collected, required });
}
