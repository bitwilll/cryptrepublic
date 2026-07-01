import "server-only";
import { getAddress, type Address } from "viem";
import { prisma } from "@/lib/db";

/**
 * Resolve the applicant EVM address BOUND to a user's session — a VERIFIED
 * `LinkedWallet` for the user. The applicant is NEVER trusted from a
 * client-supplied field (applicant-binding rule): a witness may only sign for
 * the address the app resolved here.
 *
 * Returns the checksummed address, or `null` if the user has no verified wallet
 * (they must connect + verify a wallet before requesting witnesses).
 */
export async function resolveApplicantAddress(userId: string): Promise<Address | null> {
  const wallet = await prisma.linkedWallet.findFirst({
    where: { userId, chain: "EVM", verifiedAt: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { address: true },
  });
  if (!wallet) return null;
  return getAddress(wallet.address);
}
