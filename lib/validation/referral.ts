import { z } from "zod";

/**
 * Citizen referral CREATE body (Wave 12). The referred applicant is named by
 * their signup EMAIL (a registered user), resolved to a userId server-side —
 * never a client-supplied userId or raw wallet (unspoofable). `.strict()`
 * rejects any extra key.
 */
export const referralCreateSchema = z
  .object({
    referredEmail: z
      .string()
      .email()
      .transform((s) => s.toLowerCase()),
  })
  .strict();
export type ReferralCreateInput = z.infer<typeof referralCreateSchema>;
