import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { activeChain } from "@/lib/config/chain";
import { passportAddress } from "@/config/contracts";
import { attestationDomain, ATTESTATION_TYPES, nameHashOf } from "@/lib/passport/attestation";
import { readApplicantNonceServer, readRequiredWitnessesServer } from "@/lib/passport/serverReads";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { json, badRequest } from "@/lib/http/responses";

/**
 * GET → the exact EIP-712 typed data an existing citizen signs to witness THIS
 * applicant. The `applicant` is BOUND to the user's verified LinkedWallet — NOT
 * a client-supplied query param. Persists `witnessNonce`/`witnessDeadline`/
 * `applicantAddress` and CLEARS any previously collected WitnessSignature rows (a
 * fresh nonce invalidates all prior sigs — single-outstanding-request invariant).
 */
export async function GET(req: Request): Promise<Response> {
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const application = await prisma.citizenshipApplication.findUnique({
    where: { userId },
    select: { id: true, name: true, status: true },
  });
  if (!application || !application.name) {
    return badRequest("Attest your name before requesting witnesses.");
  }

  const applicant = await resolveApplicantAddress(userId);
  if (!applicant) {
    return badRequest(
      "Verify a wallet first (Dashboard → Wallet → Verify this wallet) — witnesses attest to your verified address.",
    );
  }

  const chainId = activeChain().primaryChainId;

  let nonce: bigint;
  let requiredWitnesses: number;
  try {
    nonce = await readApplicantNonceServer(chainId, applicant);
    requiredWitnesses = await readRequiredWitnessesServer(chainId);
  } catch {
    return badRequest("Passport contract is not reachable on this chain.");
  }

  const nameHash = nameHashOf(application.name);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // now + 1h

  // Persist the request context + clear prior sigs (nonce rotation invalidates them).
  await prisma.$transaction([
    prisma.witnessSignature.deleteMany({ where: { applicationId: application.id } }),
    prisma.citizenshipApplication.update({
      where: { userId },
      data: {
        applicantAddress: applicant,
        witnessNonce: nonce.toString(),
        witnessDeadline: deadline.toString(),
      },
    }),
  ]);

  return json({
    domain: attestationDomain(chainId, passportAddress(chainId)),
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: {
      applicant,
      nameHash,
      nonce: nonce.toString(),
      deadline: deadline.toString(),
    },
    requiredWitnesses,
  });
}
