import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * The Civic ID (Wave 17): an ANONYMOUS, unique, shareable handle for every
 * citizen — `CR-XXXX-XXXX` — printed on the passport. Unlike the sequential
 * public Citizen № (passport tokenId), the Civic ID is random and reveals
 * nothing: no name, no email, no join order. Citizens hand it out themselves
 * to be added as friends/family, invited to groups, or asked for
 * endorsements. Lazily assigned on first read; collision-safe via the unique
 * column + bounded retry.
 */

// Crockford-style base32 without vowels or lookalikes (no A/E/I/O/U/L/1/0):
// avoids accidental words and transcription errors.
const ALPHABET = "23456789BCDFGHJKMNPQRSTVWXYZ";

export function generateCivicId(): string {
  const pick = () => ALPHABET[randomInt(ALPHABET.length)];
  const quad = () => pick() + pick() + pick() + pick();
  return `CR-${quad()}-${quad()}`;
}

export const CIVIC_ID_RE =
  /^CR-[23456789BCDFGHJKMNPQRSTVWXYZ]{4}-[23456789BCDFGHJKMNPQRSTVWXYZ]{4}$/;

/** Normalize user input: uppercase, unify dashes/spaces. Returns null when malformed. */
export function normalizeCivicId(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[\s–—]+/g, "-");
  return CIVIC_ID_RE.test(cleaned) ? cleaned : null;
}

/** Get the user's Civic ID, assigning one atomically on first use. */
export async function getOrAssignCivicId(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { civicId: true },
  });
  if (existing?.civicId) return existing.civicId;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCivicId();
    try {
      // Guarded update: only writes when still unassigned (idempotent under races).
      const res = await prisma.user.updateMany({
        where: { id: userId, civicId: null },
        data: { civicId: candidate },
      });
      if (res.count === 0) {
        const winner = await prisma.user.findUnique({
          where: { id: userId },
          select: { civicId: true },
        });
        if (winner?.civicId) return winner.civicId;
        continue; // user missing civicId but update matched nothing — retry
      }
      return candidate;
    } catch {
      // unique collision on civicId — try a fresh candidate
    }
  }
  throw new Error("Could not assign a Civic ID after 5 attempts.");
}
