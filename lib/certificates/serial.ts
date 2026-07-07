/**
 * Certificate serials (Wave 15 — Identity): "CR-<year>-<6 base32 chars>".
 * The 6-char code is DERIVED from the record id (RFC 4648 base32 of the id's
 * UTF-8 bytes, last 6 chars — the tail of the id carries its entropy), so a
 * serial can always be recomputed from the row and never encodes anything but
 * public data. Uniqueness is enforced by the DB (`serial @unique`).
 */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 (no padding) of raw bytes. */
export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function certificateSerial(id: string, issuedAt: Date): string {
  const code = base32(new TextEncoder().encode(id)).slice(-6).padStart(6, "A");
  return `CR-${issuedAt.getUTCFullYear()}-${code}`;
}

export const SERIAL_PATTERN = /^CR-\d{4}-[A-Z2-7]{6}$/;
