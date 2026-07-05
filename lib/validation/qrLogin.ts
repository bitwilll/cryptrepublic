import { z } from "zod";

// `.strict()` rejects unknown keys (defence in depth). Mirrors siweVerifySchema
// with an added challengeId that ties the signature to a specific login request.
export const qrApproveSchema = z
  .object({
    challengeId: z.string().min(1),
    message: z.string().min(1),
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  })
  .strict();
