import { z } from "zod";

/**
 * Zod `.strict()` schemas for the dashboard mutation bodies (unknown keys
 * rejected — mirrors lib/validation/mint.ts). All PUBLIC content; no secret
 * fields. `proposalId` + `txHash` are REQUIRED on the propose-embassy create path
 * because the route binds the off-chain content to the on-chain proposal's
 * `proposer` + `descriptionHash` — a proposal with no on-chain id cannot pass the
 * authorship/hash binding.
 */

const numericString = z.string().regex(/^\d+$/, "expected a numeric string");
const hex = z.string().regex(/^0x[0-9a-fA-F]+$/, "invalid hex");

export const commentSchema = z
  .object({
    proposalId: numericString,
    body: z.string().min(1).max(2000),
  })
  .strict();

export type CommentInput = z.infer<typeof commentSchema>;

export const proposeEmbassySchema = z
  .object({
    code: z.string().min(2).max(8),
    name: z.string().min(1).max(120),
    neighborhood: z.string().min(1).max(200),
    city: z.string().min(1).max(120),
    country: z.string().min(1).max(120),
    proposalId: numericString,
    txHash: hex,
  })
  .strict();

export type ProposeEmbassyInput = z.infer<typeof proposeEmbassySchema>;

/**
 * The canonical off-chain proposal content whose keccak256 MUST equal the
 * on-chain `proposals(proposalId).descriptionHash`. Field order is fixed so the
 * client and server derive the identical hash.
 */
export function canonicalEmbassyContent(input: {
  code: string;
  name: string;
  neighborhood: string;
  city: string;
  country: string;
}): string {
  return ["embassy", input.code, input.name, input.neighborhood, input.city, input.country].join(
    "\n",
  );
}
