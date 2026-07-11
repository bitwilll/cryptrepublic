import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { readPassportStatusServer } from "@/lib/passport/serverReads";
import { computeTrustScore } from "@/lib/trust/score";
import { REFERRAL_LINK_THRESHOLD } from "@/lib/gov/types";

/**
 * Shareable referral links (Wave 17). A high-standing citizen may mint short
 * slugs that bind `?ref=<code>` signups to them as Referral edges. STRICTLY
 * score-gated: finalScore > REFERRAL_LINK_THRESHOLD (65) — exactly 65 is NOT
 * enough (mirrors the > 50 referral gate's exclusive convention). At most
 * MAX_ACTIVE_LINKS_PER_USER unrevoked links per citizen. The gate re-computes
 * the SAME trust score the referral gate reads (lib/referrals/gate.ts) so the
 * two can never drift apart.
 */

// Lowercase URL-slug alphabet in the spirit of the Civic ID alphabet
// (lib/identity/civicId.ts): no vowels or lookalikes (a/e/i/o/u/l/0/1
// excluded) — avoids accidental words and transcription errors.
const CODE_ALPHABET = "23456789bcdfghjkmnpqrstvwxyz";
const CODE_LENGTH = 10;

/** Codes this app mints are 10 chars; 8..10 accepted for forward-compat. */
export const REFERRAL_LINK_CODE_RE = /^[23456789bcdfghjkmnpqrstvwxyz]{8,10}$/;

export function generateLinkCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export const MAX_ACTIVE_LINKS_PER_USER = 3;

export interface ReferralLinkGate {
  unlocked: boolean; // finalScore STRICTLY above the threshold
  finalScore: number;
  threshold: number; // REFERRAL_LINK_THRESHOLD (65)
}

/**
 * The link-creation gate. Resolves the owner's chain identity and computes the
 * hybrid trust score exactly like canCreateReferral (lib/referrals/gate.ts):
 * graceful on an unreachable chain (citizen-dependent signals degrade to 0).
 * READ-ONLY — createReferralLink enforces it.
 */
export async function referralLinkGate(
  chainId: number,
  ownerUserId: string,
): Promise<ReferralLinkGate> {
  const user = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { trustAdjustment: true },
  });
  const adminAdjustment = user?.trustAdjustment ?? 0;

  const address = await resolveApplicantAddress(ownerUserId);
  let tokenId: bigint | null = null;
  if (address) {
    try {
      tokenId = (await readPassportStatusServer(chainId, address)).tokenId;
    } catch {
      tokenId = null;
    }
  }

  const { finalScore } = await computeTrustScore(
    chainId,
    { userId: ownerUserId, address, tokenId },
    adminAdjustment,
  );

  return {
    unlocked: finalScore > REFERRAL_LINK_THRESHOLD,
    finalScore,
    threshold: REFERRAL_LINK_THRESHOLD,
  };
}

export type CreateReferralLinkResult =
  | {
      ok: true;
      link: { id: string; code: string; label: string | null; createdAt: Date };
    }
  | { ok: false; reason: "GATED"; finalScore: number; threshold: number }
  | { ok: false; reason: "CAP"; maxActive: number };

/**
 * Create a referral link for `ownerUserId`: gate (score > 65 strict), cap
 * (3 unrevoked links), then insert with a collision-safe code (unique column
 * + bounded retry, mirroring getOrAssignCivicId).
 */
export async function createReferralLink(
  chainId: number,
  ownerUserId: string,
  label?: string,
): Promise<CreateReferralLinkResult> {
  const gate = await referralLinkGate(chainId, ownerUserId);
  if (!gate.unlocked) {
    return { ok: false, reason: "GATED", finalScore: gate.finalScore, threshold: gate.threshold };
  }

  const active = await prisma.referralLink.count({ where: { ownerUserId, revokedAt: null } });
  if (active >= MAX_ACTIVE_LINKS_PER_USER) {
    return { ok: false, reason: "CAP", maxActive: MAX_ACTIVE_LINKS_PER_USER };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const link = await prisma.referralLink.create({
        data: { code: generateLinkCode(), ownerUserId, label: label ?? null },
      });
      return {
        ok: true,
        link: { id: link.id, code: link.code, label: link.label, createdAt: link.createdAt },
      };
    } catch (e) {
      // Unique collision on `code` — try a fresh candidate.
      if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("Could not assign a referral-link code after 5 attempts.");
}
