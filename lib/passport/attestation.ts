import {
  keccak256,
  stringToHex,
  hexToString,
  hashTypedData,
  recoverTypedDataAddress,
  size,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";

/**
 * Pure, isomorphic EIP-712 Attestation builder. Usable server-side (witness
 * signature recovery in `witnesses/submit`) AND client-side (the applicant
 * computing the digest witnesses sign). NO `client-only`/`server-only` marker.
 *
 * The domain + type + field ORDER match `CryptRepublicPassport.sol`
 * (`EIP712("CryptRepublicPassport", "1")`) and `WitnessAttestation.sol`
 * (`Attestation(address applicant,bytes32 nameHash,uint256 nonce,uint256 deadline)`)
 * BYTE-FOR-BYTE — a Vitest test cross-checks the digest against a manual
 * reconstruction and a viem-signed recovery.
 */

export interface Attestation {
  applicant: Address;
  nameHash: Hex; // bytes32
  nonce: bigint;
  deadline: bigint;
}

/** keccak256(stringToHex(declaredName)) — the on-chain nameHash. */
export function nameHashOf(declaredName: string): Hex {
  return keccak256(stringToHex(declaredName));
}

/**
 * UTF-8 short string (≤31 bytes) → right-padded bytes32 (motto/domicile),
 * identical to Solidity's `bytes32("...")` short-string encoding. Throws if the
 * UTF-8 encoding exceeds 31 bytes (bytes32 cannot hold 32 significant bytes with
 * this right-padded convention without ambiguity).
 */
export function toBytes32String(s: string): Hex {
  const utf8Len = new TextEncoder().encode(s).length;
  if (utf8Len > 31) {
    throw new Error(`String too long for bytes32 (${utf8Len} > 31 bytes): ${s}`);
  }
  // viem right-pads to `size` by default (pad direction "right" for hex).
  const hex = stringToHex(s, { size: 32 });
  // Defensive: ensure we produced exactly 32 bytes.
  if (size(hex) !== 32) {
    throw new Error("bytes32 encoding did not produce 32 bytes");
  }
  return hex;
}

/**
 * Decode a right-padded bytes32 short string (motto/domicile) back to a UTF-8
 * string, stripping the trailing NUL padding. The inverse of `toBytes32String`.
 * Used by `PassportView` to display on-chain `motto`/`domicile`. An opaque /
 * non-string bytes32 (e.g. a genesis nameHash) simply yields whatever printable
 * prefix decodes — callers must NOT assume it round-trips to a display name.
 */
export function decodeBytes32String(b: Hex): string {
  return hexToString(b, { size: 32 });
}

export function attestationDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return {
    name: "CryptRepublicPassport",
    version: "1",
    chainId,
    verifyingContract,
  };
}

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "applicant", type: "address" },
    { name: "nameHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * The viem `hashTypedData` digest a witness signs — equals the contract's
 * `_hashTypedDataV4(structHash)`.
 */
export function attestationDigest(
  chainId: number,
  verifyingContract: Address,
  a: Attestation,
): Hex {
  return hashTypedData({
    domain: attestationDomain(chainId, verifyingContract),
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: a,
  });
}

/** Recover the witness address from a signature over the attestation. */
export function recoverWitness(
  chainId: number,
  verifyingContract: Address,
  a: Attestation,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain: attestationDomain(chainId, verifyingContract),
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: a,
    signature,
  });
}
