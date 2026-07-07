import type { ListingStatus } from "@/lib/services/types";
import type { ListingPatchInput } from "@/lib/validation/store";

/**
 * Citizen Store listing state machine (Wave 15). The ONLY legal seller
 * transitions: ACTIVE→WITHDRAWN (withdraw), ACTIVE→SOLD (mark-sold),
 * WITHDRAWN→ACTIVE (relist). Everything else — including anything from SOLD
 * or REMOVED — returns null (the route answers 400). REMOVED is a Registry
 * moderation state and is never seller-reversible.
 */
export function nextListingStatus(
  current: string,
  action: ListingPatchInput["action"],
): ListingStatus | null {
  if (action === "withdraw" && current === "ACTIVE") return "WITHDRAWN";
  if (action === "mark-sold" && current === "ACTIVE") return "SOLD";
  if (action === "relist" && current === "WITHDRAWN") return "ACTIVE";
  return null;
}

/** Cap on simultaneously ACTIVE listings per seller. */
export const MAX_ACTIVE_LISTINGS = 20;
