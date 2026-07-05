import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { issueNonce } from "@/lib/auth/siwe";

/** A login challenge lives ~2 minutes — long enough to scan + approve, short enough to bound replay. */
export const CHALLENGE_TTL_MS = 120_000;

// Unambiguous alphabet (no 0/1/O/I). The matchCode is a VISUAL confirmation code
// shown on both devices — NOT a secret (the nonce + SIWE signature are the auth).
const MATCH_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeMatchCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += MATCH_ALPHABET[randomInt(MATCH_ALPHABET.length)];
  return out;
}

export interface CreatedChallenge {
  challengeId: string;
  nonce: string;
  matchCode: string;
}

/**
 * Create a pending, short-TTL wallet-QR login challenge. The `nonce` is a REAL
 * single-use SiweNonce (so verifySiweSignature consumes it), and the challenge
 * stores the SAME nonce — the approve route binds the signature to THIS
 * challenge via `siwe.nonce === challenge.nonce`. Opportunistically sweeps
 * expired/consumed rows (best-effort, mirrors issueNonce).
 */
export async function createChallenge(): Promise<CreatedChallenge> {
  try {
    await prisma.walletLoginChallenge.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { status: "consumed" }] },
    });
  } catch {
    /* non-fatal */
  }
  const nonce = await issueNonce();
  const matchCode = makeMatchCode();
  const row = await prisma.walletLoginChallenge.create({
    data: { nonce, matchCode, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
  return { challengeId: row.id, nonce, matchCode };
}

export interface PendingChallenge {
  id: string;
  nonce: string;
  matchCode: string;
  status: string;
  userId: string | null;
}

/** A challenge that is still PENDING and unexpired; else null (callers treat null opaquely). */
export async function loadPendingChallenge(challengeId: string): Promise<PendingChallenge | null> {
  if (!challengeId) return null;
  const row = await prisma.walletLoginChallenge.findUnique({ where: { id: challengeId } });
  if (!row) return null;
  if (row.status !== "pending") return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return {
    id: row.id,
    nonce: row.nonce,
    matchCode: row.matchCode,
    status: row.status,
    userId: row.userId,
  };
}
