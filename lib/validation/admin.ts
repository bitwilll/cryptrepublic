import { z } from "zod";
import { KYC_STATUSES } from "@/lib/auth/types";

/**
 * Zod `.strict()` schemas for the /api/admin mutation bodies (Wave 9). Extends
 * the lib/validation/mint.ts convention: unknown keys are REJECTED, which is
 * itself a security boundary here —
 *   - NO schema carries a `role` field (no promotion path, constraint #2);
 *   - the review schema carries NO `status`/`citizenTokenId`/`sealTxHash`
 *     (admin cannot fake chain state, constraint #6).
 */

export const suspendSchema = z.object({ suspended: z.boolean() }).strict();

export const kycSetSchema = z.object({ kycStatus: z.enum(KYC_STATUSES) }).strict();

/** { sessionId } XOR { all: true } — both-or-neither rejected by union+strict. */
export const sessionsRevokeSchema = z.union([
  z.object({ sessionId: z.string().min(1).max(64) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

export const applicationReviewSchema = z
  .object({
    kycStatus: z.enum(KYC_STATUSES).optional(),
    reviewNote: z.string().max(2000).optional(),
  })
  .strict()
  .refine((d) => d.kycStatus !== undefined || d.reviewNote !== undefined, {
    message: "Provide kycStatus and/or reviewNote.",
  });
