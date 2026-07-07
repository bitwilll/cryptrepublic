import { z } from "zod";
import { isCommissaryItemId } from "@/lib/content/commissary";

/**
 * Commissary register-of-interest body (Wave 15). `itemId` must be a real
 * catalogue id from lib/content/commissary.ts — the catalogue is content, not a
 * table, so validation (not a foreign key) guards referential integrity.
 * `.strict()` rejects any extra key. Shared by POST (register) and DELETE
 * (withdraw).
 */
export const commissaryInterestSchema = z
  .object({
    itemId: z.string().min(1).max(64).refine(isCommissaryItemId, "Unknown commissary item."),
  })
  .strict();

export type CommissaryInterestInput = z.infer<typeof commissaryInterestSchema>;
