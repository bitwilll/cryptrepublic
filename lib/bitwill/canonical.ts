import { getAddress, keccak256, sha256, stringToBytes, type Address, type Hex } from "viem";

/**
 * Pure, isomorphic BitWill canonical payload (Wave 15). Usable client-side
 * (the citizen's wallet signs the EXACT string) AND server-side (the route
 * rebuilds the string from the submitted fields and verifies EIP-191 recovery).
 * NO `client-only`/`server-only` marker — mirrors lib/passport/attestation.ts.
 *
 * The directive is an OFF-CHAIN signed declaration of intent. It never holds,
 * moves, or can move funds; the estate memo itself is committed only as a
 * sha256 hash so the signed text stays stable while the memo remains a plain
 * database column the owner can read back.
 */

export const BITWILL_PAYLOAD_VERSION = "CRYPTREPUBLIC BITWILL v1";

/** Placeholder written into the payload when no beneficiary address is named. */
export const NO_BENEFICIARY_ADDRESS = "–"; // en dash, per the canonical format

export interface BitwillCanonicalInput {
  owner: string; // EVM address (any case — checksummed in the payload)
  beneficiaryName: string;
  beneficiaryContact: string;
  beneficiaryAddress?: string; // optional EVM address
  assetsMemo: string;
}

/** sha256 commitment of the free-text estate memo (the only memo derivative signed). */
export function estateHash(assetsMemo: string): Hex {
  return sha256(stringToBytes(assetsMemo));
}

/**
 * The exact string the owner's wallet signs (EIP-191 personal_sign). Field
 * order and labels are fixed; addresses are EIP-55 checksummed so client and
 * server derive byte-identical payloads from the same fields.
 */
export function canonicalBitwillPayload(input: BitwillCanonicalInput): string {
  const owner = getAddress(input.owner as Address);
  const beneficiaryAddress = input.beneficiaryAddress
    ? getAddress(input.beneficiaryAddress as Address)
    : NO_BENEFICIARY_ADDRESS;
  return [
    BITWILL_PAYLOAD_VERSION,
    `OWNER: ${owner}`,
    `BENEFICIARY: ${input.beneficiaryName}`,
    `CONTACT: ${input.beneficiaryContact}`,
    `BENEFICIARY-ADDRESS: ${beneficiaryAddress}`,
    `ESTATE: ${estateHash(input.assetsMemo)}`,
  ].join("\n");
}

/** keccak256 of the canonical payload — the public directive hash on record. */
export function directiveHashOf(payload: string): Hex {
  return keccak256(stringToBytes(payload));
}
