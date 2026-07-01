import { z } from "zod";

// zod v4: `z.email()` is the top-level email validator (replaces the deprecated
// `z.string().email()`). `.strict()` rejects unknown keys (defence in depth).
export const registerSchema = z
  .object({
    email: z.email(),
    passphrase: z.string().min(12).max(256),
    name: z.string().min(1).max(64),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.email(),
    passphrase: z.string().min(1).max(256),
  })
  .strict();

export const siweVerifySchema = z
  .object({
    message: z.string().min(1),
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  })
  .strict();

export const applicationSchema = z
  .object({
    name: z.string().min(1).max(64),
    domicileCity: z.string().min(1).max(120),
    hostCountry: z.string().min(1).max(120),
    motto: z.string().max(160).optional(),
  })
  .strict();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
