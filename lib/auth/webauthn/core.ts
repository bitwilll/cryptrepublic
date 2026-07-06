import "server-only";
import { prisma } from "@/lib/db";

/**
 * WebAuthn passkey core (Wave 14). PUBLIC data only — the server stores the
 * credential's public key + counter + metadata; the private half never leaves
 * the user's authenticator, so this module can never sign as the user.
 *
 * Ceremony challenges mirror SiweNonce: short-TTL rows consumed exactly once
 * (an updateMany usedAt-null guard). Registration challenges are BOUND to the
 * enrolling user's id; login challenges carry userId null.
 */

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const RP_NAME = "CryptRepublic";

export type CeremonyType = "registration" | "authentication";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** The WebAuthn relying-party ID: the registrable host (a leading `www.` stripped, no port). */
export function rpId(): string {
  let host: string;
  try {
    host = new URL(appUrl()).hostname;
  } catch {
    host = "localhost";
  }
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** Origins a ceremony response may come from: the configured origin + its www twin. */
export function expectedOrigins(): string[] {
  let url: URL;
  try {
    url = new URL(appUrl());
  } catch {
    url = new URL("http://localhost:3000");
  }
  const origin = url.origin;
  const host = url.host;
  const twinHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const twin = `${url.protocol}//${twinHost}`;
  return origin === twin ? [origin] : [origin, twin];
}

/**
 * Persist a ceremony challenge (as issued inside the generated options) for
 * single-use verification. Opportunistically sweeps expired/used rows
 * (best-effort — mirrors issueNonce).
 */
export async function storeChallenge(
  challenge: string,
  type: CeremonyType,
  userId?: string,
): Promise<void> {
  try {
    await prisma.webAuthnChallenge.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] },
    });
  } catch {
    /* non-fatal */
  }
  await prisma.webAuthnChallenge.create({
    data: {
      challenge,
      type,
      userId: userId ?? null,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

/**
 * Consume a ceremony challenge exactly once. For registration the row must be
 * bound to the SAME user; for authentication it must be unbound. Returns false
 * for unknown / wrong-type / wrong-user / expired / already-used.
 */
export async function consumeChallenge(
  challenge: string,
  type: CeremonyType,
  userId?: string,
): Promise<boolean> {
  const res = await prisma.webAuthnChallenge.updateMany({
    where: {
      challenge,
      type,
      userId: userId ?? null,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  return res.count === 1;
}

/**
 * Extract the base64url challenge a browser ceremony response was signed over
 * (clientDataJSON.challenge — string-equal to the options challenge we stored).
 * Returns null on any malformed input.
 */
export function challengeFromClientData(clientDataJSON: string): string | null {
  try {
    const decoded = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8")) as {
      challenge?: unknown;
    };
    return typeof decoded.challenge === "string" && decoded.challenge.length > 0
      ? decoded.challenge
      : null;
  } catch {
    return null;
  }
}

/** Uint8Array public key ↔ base64url storage string. */
export function publicKeyToString(publicKey: Uint8Array): string {
  return Buffer.from(publicKey).toString("base64url");
}
export function publicKeyFromString(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

/** Comma-joined transport hints ↔ the array the library expects. */
export function transportsToString(transports?: string[]): string | null {
  return transports && transports.length > 0 ? transports.join(",") : null;
}
export function transportsFromString(s: string | null): string[] | undefined {
  return s ? s.split(",") : undefined;
}
