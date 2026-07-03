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

/** Wave 10 — approve-mint accepts NO fields at all: the body is EMPTY ({}).
 *  The server owns the approval columns (adminApprovedAt/adminApprovedBy) and
 *  the chain owns citizen state — a body naming status/citizenTokenId/
 *  sealTxHash/sealedAt/adminApprovedAt/adminApprovedBy is 400 by strictness. */
export const approveMintSchema = z.object({}).strict();

// ─────────────────────────────────────────────────────────────────────────
// B2 — content + flag schemas (constraint #7 honesty rules live HERE where
// they are schema-expressible; table-wide rules — allocation sum, hash-bound
// proposal bodies — are route-level, inside the transaction).
// ─────────────────────────────────────────────────────────────────────────

/** Seed-scrub mirror (Wave-7 A2): fabricated on-chain provenance is rejected. */
const FABRICATED_PROVENANCE = /CR-L2|CryptRepublic L2|TITLED ON CHAIN/i;
function noFabricatedProvenance(d: { name: string; location: string; status: string }): boolean {
  return !FABRICATED_PROVENANCE.test([d.name, d.location, d.status].join(" "));
}

export const assetSchema = z
  .object({
    ref: z.string().min(2).max(16),
    kind: z.enum(["re", "ip", "eq", "tr"]),
    name: z.string().min(1).max(200),
    location: z.string().min(1).max(200),
    valueUsd: z.string().regex(/^\d+$/), // BigInt as decimal string over the wire
    yieldBps: z.number().int().min(0).max(100_000),
    annualYieldUsd: z.string().regex(/^\d+$/),
    status: z.string().min(1).max(120),
    acquiredAt: z.string().min(1).max(40),
  })
  .strict()
  .refine(noFabricatedProvenance, {
    message: "Fabricated on-chain provenance is not allowed.",
  });

export const embassySchema = z
  .object({
    code: z.string().min(2).max(8),
    name: z.string().min(1).max(200),
    neighborhood: z.string().min(1).max(200),
    hours: z.string().min(1).max(120),
    foundedAt: z.string().min(1).max(40),
    brandColor: z.string().min(1).max(32),
    city: z.string().min(1).max(120),
    country: z.string().min(1).max(120),
  })
  .strict();

export const censusSchema = z
  .object({
    code: z.string().min(2).max(8),
    name: z.string().min(1).max(200),
    lat: z.number().min(-90).max(90),
    long: z.number().min(-180).max(180),
    hasEmbassy: z.boolean(),
    seededCount: z.number().int().min(0),
  })
  .strict();

/** bucket is ASCII [a-z0-9_] ≤ 32 chars = ≤ 32 BYTES — guarantees the A3
 *  canonical bytes32 mapping `stringToHex(bucket, {size:32})` can NEVER throw
 *  SizeExceedsPaddingSizeError. A looser bound (multi-byte UTF-8, > 32 chars)
 *  would let a schema-valid DB row crash prepareSetAllocation AND
 *  readAdminParamsServer. Matches the seeded key style ("embassy_ops"). */
export const allocationSchema = z
  .object({
    bucket: z.string().regex(/^[a-z0-9_]{1,32}$/),
    label: z.string().min(1).max(120),
    targetBps: z.number().int().min(0).max(10_000),
    color: z.string().max(32),
  })
  .strict();

export const constitutionSchema = z
  .object({
    key: z.string().min(1).max(64),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(20_000),
    citation: z.string().max(200).nullable().optional(),
  })
  .strict();

/** body is applied ONLY when the row's descriptionHash is null (route-level
 *  rule — editing a hash-bound body would falsify the on-chain binding). */
export const proposalContentSchema = z
  .object({
    title: z.string().min(1).max(200),
    tag: z.enum(["PROCEDURAL", "CULTURAL", "FISCAL", "CIVIC", "TECHNICAL"]),
    body: z.string().max(20_000).optional(),
  })
  .strict();

export const flagSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]{3,64}$/),
    enabled: z.boolean(),
    description: z.string().max(300).nullable().optional(),
  })
  .strict();

/** Wave 12 — allocate referral tokens. ADD-ONLY (1..1000 per call): an admin
 *  cannot set an arbitrary balance or go negative (that would risk under-flowing
 *  an in-flight consume). Revoking tokens, if ever needed, is a separate route. */
export const referralTokenAllocateSchema = z
  .object({ delta: z.number().int().min(1).max(1000) })
  .strict();

/** Wave 12 — SET the absolute trust adjustment (signed, -100..100). Absolute so
 *  re-posting is idempotent; the score clamp keeps finalScore in 0..100. */
export const trustAdjustSchema = z
  .object({ adjustment: z.number().int().min(-100).max(100) })
  .strict();
