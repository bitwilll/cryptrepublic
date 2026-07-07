import type { CertificateKind } from "@/lib/services/types";

/**
 * Canonical signing payload for a CryptRepublic certificate (Wave 15 —
 * Identity). BOTH sides build this exact string: the citizen's wallet signs it
 * CLIENT-SIDE, and the server rebuilds it from the submitted fields to recover
 * the signer. Determinism rules:
 *   - line endings in title/subject are normalized to "\n" (CRLF/CR → LF)
 *   - the content hash is lowercased
 *   - fields are joined with single "\n" in a fixed order
 * The payload embeds the SHA-256 of the content (message text, or document
 * bytes hashed in-browser) — for documents, ONLY the fingerprint is signed;
 * the file itself never leaves the citizen's device. No key material ever
 * touches this module.
 */

export const CERTIFICATE_PAYLOAD_HEADER = "CRYPTREPUBLIC CERTIFICATE v1";

export interface CertificateFields {
  kind: CertificateKind;
  title: string;
  /** message text (MESSAGE) or the file name (DOCUMENT) */
  subject: string;
  /** 0x-prefixed SHA-256 hex of the content */
  contentHash: string;
}

/** Normalize platform line endings so the signed bytes are deterministic. */
export function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function canonicalPayload(fields: CertificateFields): string {
  return [
    CERTIFICATE_PAYLOAD_HEADER,
    `KIND: ${fields.kind}`,
    `TITLE: ${normalizeText(fields.title)}`,
    `SUBJECT: ${normalizeText(fields.subject)}`,
    `SHA-256: ${fields.contentHash.toLowerCase()}`,
  ].join("\n");
}

/** SHA-256 of raw bytes via Web Crypto (browser and Node ≥18) → 0x-hex. */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<`0x${string}`> {
  // Copy into a fresh Uint8Array<ArrayBuffer> — satisfies BufferSource even for
  // views over SharedArrayBuffer, and never aliases caller memory.
  const data = new Uint8Array(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

/** SHA-256 of NORMALIZED message text (the MESSAGE-mode content hash). */
export async function sha256HexOfText(text: string): Promise<`0x${string}`> {
  return sha256Hex(new TextEncoder().encode(normalizeText(text)));
}
