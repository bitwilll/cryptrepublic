import { z } from "zod";
import { CERTIFICATE_KINDS } from "@/lib/services/types";

/**
 * Zod schemas for the certificate routes (Wave 15 — Identity). Follows the
 * lib/validation/mint.ts style: `.strict()` (unknown keys rejected), PUBLIC
 * material only — a content hash and a wallet SIGNATURE are public
 * attestations; no key or seed ever appears in a body.
 */

const sha256Hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "invalid SHA-256 hash");
const hexSig = z.string().regex(/^0x[0-9a-fA-F]+$/, "invalid signature");

export const certificateCreateSchema = z
  .object({
    kind: z.enum(CERTIFICATE_KINDS),
    title: z.string().min(3).max(120),
    /** message text (MESSAGE) or the file name (DOCUMENT) */
    subject: z.string().min(1).max(2000),
    contentHash: sha256Hash,
    signature: hexSig,
  })
  .strict();
export type CertificateCreateInput = z.infer<typeof certificateCreateSchema>;

/** /api/certificates/verify?serial=… — the serial as issued (CR-YYYY-XXXXXX). */
export const certificateSerialSchema = z.string().regex(/^CR-\d{4}-[A-Z2-7]{6}$/);
