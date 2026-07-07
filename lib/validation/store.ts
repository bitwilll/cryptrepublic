import { z } from "zod";
import { isStoreCategory } from "@/lib/services/types";

/**
 * Citizen Store schemas (Wave 15). Pricing is INTENT ONLY — priceCoin is a
 * decimal STRING (never a float) validated by shape + bounds and stored as
 * given; settlement is peer-to-peer between citizens, the Republic never
 * holds or moves funds. `.strict()` everywhere rejects unknown keys.
 */

/** Whole CRPT (up to 10,000,000) with an optional fractional part of <= 2 dp. */
export const PRICE_COIN_REGEX = /^\d{1,8}(\.\d{1,2})?$/;

export const priceCoinSchema = z
  .string()
  .regex(PRICE_COIN_REGEX, "Price must be a decimal number with at most 2 decimal places.")
  .refine((s) => Number(s) > 0, "Price must be greater than zero.")
  .refine((s) => Number(s) <= 10_000_000, "Price cannot exceed 10,000,000 $CRYPT.");

export const listingCreateSchema = z
  .object({
    title: z.string().trim().min(4).max(80),
    description: z.string().trim().min(20).max(2000),
    category: z.string().refine(isStoreCategory, "Unknown category."),
    priceCoin: priceCoinSchema,
  })
  .strict();
export type ListingCreateInput = z.infer<typeof listingCreateSchema>;

/** Seller state machine actions (ACTIVE→WITHDRAWN, ACTIVE→SOLD, WITHDRAWN→ACTIVE). */
export const listingPatchSchema = z
  .object({
    action: z.enum(["withdraw", "mark-sold", "relist"]),
  })
  .strict();
export type ListingPatchInput = z.infer<typeof listingPatchSchema>;

export const inquiryCreateSchema = z
  .object({
    message: z.string().trim().min(4).max(1000),
  })
  .strict();
export type InquiryCreateInput = z.infer<typeof inquiryCreateSchema>;

export const inquiryReplySchema = z
  .object({
    reply: z.string().trim().min(1).max(1000),
  })
  .strict();
export type InquiryReplyInput = z.infer<typeof inquiryReplySchema>;
