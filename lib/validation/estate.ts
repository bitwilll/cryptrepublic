import { z } from "zod";
import { isAddress } from "viem";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { INSURANCE_STATUSES, isInsuranceProduct } from "@/lib/services/types";

/**
 * Wave 15 — estate + insurance + admin services-desk schemas. `.strict()`
 * everywhere (lib/validation/admin.ts convention: unknown keys are REJECTED).
 *
 * NON-CUSTODIAL GUARD: a BitWill directive is a signed DECLARATION — never a
 * vault. `looksLikeKeyMaterial` refuses memos that read like a seed phrase or
 * private key so the registry can never become a place citizens stash key
 * material (400 with KEY_MATERIAL_ERROR, unit-tested).
 */

export const KEY_MATERIAL_ERROR = "Never place keys or seed phrases in a directive.";

const KEY_MATERIAL_PHRASES = /seed\s*[-_]?\s*phrase|private\s*[-_]?\s*key/i;

/** BIP-39 english wordlist (already a dependency via the embedded wallet). */
const BIP39_WORDS: ReadonlySet<string> = new Set(wordlist);

/**
 * True when the memo contains a run of >= 12 consecutive whitespace-separated
 * tokens that are ALL bare BIP-39 words — the shape of a pasted 12/24-word
 * mnemonic. Prose breaks such runs fast (glue words like "the"/"and"/"my" are
 * not in the wordlist), so ordinary estate descriptions pass.
 */
function hasMnemonicLikeRun(text: string): boolean {
  let run = 0;
  for (const token of text.toLowerCase().split(/\s+/)) {
    if (/^[a-z]{3,8}$/.test(token) && BIP39_WORDS.has(token)) {
      run += 1;
      if (run >= 12) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

export function looksLikeKeyMaterial(memo: string): boolean {
  return KEY_MATERIAL_PHRASES.test(memo) || hasMnemonicLikeRun(memo);
}

const SINGLE_LINE = /^[^\r\n]*$/;
const evmAddress = z.string().refine((s) => isAddress(s), { message: "Not a valid EVM address." });

/** POST /api/bitwill — file a directive (client-signed; server verifies recovery). */
export const bitwillFileSchema = z
  .object({
    beneficiaryName: z.string().min(2).max(80).regex(SINGLE_LINE, "Line breaks are not allowed."),
    beneficiaryContact: z
      .string()
      .min(3)
      .max(120)
      .regex(SINGLE_LINE, "Line breaks are not allowed."),
    beneficiaryAddress: evmAddress.optional(),
    assetsMemo: z
      .string()
      .min(10)
      .max(4000)
      .refine((s) => !looksLikeKeyMaterial(s), { message: KEY_MATERIAL_ERROR }),
    signerAddress: evmAddress,
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Not a valid signature."),
  })
  .strict();
export type BitwillFileInput = z.infer<typeof bitwillFileSchema>;

/** POST /api/bitwill/revoke — the body is EMPTY ({}); the session owns the target. */
export const bitwillRevokeSchema = z.object({}).strict();

/** POST /api/insurance/applications — register a cover application (no premiums). */
export const insuranceApplySchema = z
  .object({
    product: z.string().refine(isInsuranceProduct, { message: "Unknown product." }),
    coverageNote: z.string().min(10).max(2000),
    valueUsd: z.number().int().positive().max(100_000_000).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.product === "ASSET" && d.valueUsd === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["valueUsd"],
        message: "Declare the asset's value in whole USD.",
      });
    }
  });
export type InsuranceApplyInput = z.infer<typeof insuranceApplySchema>;

// ─────────────────────────────────────────────────────────────────────────
// Admin services desk (Wave 15 C) — mutation bodies for /api/admin/services.
// ─────────────────────────────────────────────────────────────────────────

export const INSURANCE_REVIEW_ACTIONS = ["review", "approve", "decline"] as const;
export type InsuranceReviewAction = (typeof INSURANCE_REVIEW_ACTIONS)[number];

/** PATCH /api/admin/services/insurance/[id] — a decline REQUIRES a note. */
export const insuranceReviewSchema = z
  .object({
    action: z.enum(INSURANCE_REVIEW_ACTIONS),
    reviewNote: z.string().min(3).max(500).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.action === "decline" && d.reviewNote === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewNote"],
        message: "A decline requires a review note.",
      });
    }
  });
export type InsuranceReviewInput = z.infer<typeof insuranceReviewSchema>;

/** PATCH /api/admin/services/store/[id] — removal is MODERATION, never deletion. */
export const storeRemoveSchema = z
  .object({
    action: z.literal("remove"),
    reason: z.string().min(3).max(300),
  })
  .strict();
export type StoreRemoveInput = z.infer<typeof storeRemoveSchema>;

/** ?status= filter for the admin insurance queue (unknown value → 400). */
export const insuranceStatusFilterSchema = z.enum(INSURANCE_STATUSES);
