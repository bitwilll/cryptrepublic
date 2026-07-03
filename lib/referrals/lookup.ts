import "server-only";
import { getAddress, type Address } from "viem";
import { prisma } from "@/lib/db";

/**
 * Referral lookups (Wave 12). PUBLIC data only — never a key/seed.
 *
 * resolveUserByWalletAddress is the reverse of resolveApplicantAddress
 * (lib/applications/applicant.ts): it maps a checksummed EVM address (e.g. a
 * recovered witness) back to the User who VERIFIED it as a LinkedWallet. This
 * is the identity the referral gate keys off — the witness is known ONLY by
 * ECDSA recovery, never by a session or a client-supplied field.
 */
export async function resolveUserByWalletAddress(address: string): Promise<string | null> {
  let checksummed: string;
  try {
    checksummed = getAddress(address as Address); // re-checksum defensively (any casing in)
  } catch {
    return null; // not a valid address → cannot map to a user
  }
  const wallet = await prisma.linkedWallet.findFirst({
    // address is @unique, but we still require verifiedAt so an unverified link
    // can NEVER satisfy a referral (the composite filter is not the unique key).
    where: { address: checksummed, chain: "EVM", verifiedAt: { not: null } },
    select: { userId: true },
  });
  return wallet?.userId ?? null;
}

/** True iff `referrerUserId` has an existing directed Referral edge to `referredUserId`. */
export async function referralExists(
  referrerUserId: string,
  referredUserId: string,
): Promise<boolean> {
  const row = await prisma.referral.findUnique({
    where: { referrerUserId_referredUserId: { referrerUserId, referredUserId } },
    select: { id: true },
  });
  return row !== null;
}
