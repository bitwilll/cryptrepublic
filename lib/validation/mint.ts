import { z } from "zod";

/**
 * Zod schemas for the mint/application request bodies. Extends the
 * `lib/validation/auth.ts` zod-v4 `.strict()` style (unknown keys rejected).
 *
 * These validate only PUBLIC/profile data + PUBLIC on-chain material (addresses,
 * bytes32 hashes, EIP-712 signatures). No private key / seed ever appears here.
 */

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "invalid EVM address");
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "invalid bytes32");
const hexSig = z.string().regex(/^0x[0-9a-fA-F]+$/, "invalid signature");
const numericString = z.string().regex(/^\d+$/, "expected a numeric string");

export const attestSchema = z
  .object({
    name: z.string().min(1).max(64),
    domicileCity: z.string().min(1).max(120),
    hostCountry: z.string().min(1).max(120),
  })
  .strict();

export const oathSchema = z
  .object({
    motto: z.string().min(5).max(160),
    oathAccepted: z.literal(true),
  })
  .strict();

export const witnessSubmitSchema = z
  .object({
    attestation: z
      .object({
        applicant: evmAddress,
        nameHash: bytes32,
        nonce: numericString,
        deadline: numericString,
      })
      .strict(),
    signature: hexSig,
  })
  .strict();

export const sealConfirmSchema = z
  .object({
    txHash: bytes32,
    tokenId: numericString,
  })
  .strict();
