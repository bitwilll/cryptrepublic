import "server-only";
import type { User } from "@prisma/client";
import { SiweMessage } from "siwe";
import { getAddress } from "viem";
import { prisma } from "@/lib/db";
import { generateSessionToken } from "./tokens";

export const SIWE_NONCE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ENV === "mainnet" ? 8453 : 84532;
export const ALLOWED_CHAIN_IDS: readonly number[] = [DEFAULT_CHAIN_ID];

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function appHost(): string {
  try {
    return new URL(appUrl()).host;
  } catch {
    return "localhost:3000";
  }
}

// The `uri` the SIWE message must resolve to (full origin, no trailing slash) — bound alongside domain.
export function appUri(): string {
  try {
    return new URL(appUrl()).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export class SiweError extends Error {}

export async function issueNonce(): Promise<string> {
  const nonce = generateSessionToken().slice(0, 32); // alphanumeric-ish hex, ≥8 chars per EIP-4361
  await prisma.siweNonce.create({
    data: { nonce, expiresAt: new Date(Date.now() + SIWE_NONCE_TTL_MS) },
  });
  return nonce;
}

export interface SiweVerifyResult {
  user: User;
  address: string;
}

/**
 * The cryptographic core of SIWE verification — message binding (domain/uri/
 * chain), signature verification, and single-use nonce consumption — WITHOUT
 * user resolution. Returns the checksummed signer address. Shared by the
 * SIWE login path (verifySiwe, below) and the wallet-LINK path
 * (POST /api/wallet/link — binds the proven address to the LOGGED-IN account).
 */
export async function verifySiweSignature(
  message: string,
  signature: string,
): Promise<{ address: string }> {
  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(message);
  } catch {
    throw new SiweError("Malformed SIWE message.");
  }

  // Bind BOTH domain and uri to our origin (uri check is explicit — siwe.verify does not enforce it by default).
  if (siwe.domain !== appHost()) throw new SiweError("Domain mismatch.");
  if (siwe.uri !== appUri()) throw new SiweError("URI mismatch.");
  if (!ALLOWED_CHAIN_IDS.includes(siwe.chainId)) throw new SiweError("Chain not allowed.");

  // Cryptographic verification (EOA only; no EIP-1271/RPC lookup in v1).
  // siwe v2 `verify()` resolves to { success, data } on success; it can REJECT on a
  // malformed signature. Pass `time` so expirationTime/notBefore are enforced, plus
  // `domain` + `nonce` so the library cross-checks them against the message fields.
  let fields;
  try {
    fields = await siwe.verify({
      signature,
      domain: appHost(),
      nonce: siwe.nonce,
      time: new Date().toISOString(),
    });
  } catch {
    // Defensive: malformed signatures (and domain/nonce/time mismatches) can reject.
    throw new SiweError("Signature verification failed.");
  }
  if (!fields.success) throw new SiweError("Signature verification failed.");

  // Single-use nonce: consume atomically. updateMany with usedAt=null guard prevents replay.
  const consumed = await prisma.siweNonce.updateMany({
    where: { nonce: siwe.nonce, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date(), address: getAddress(siwe.address) },
  });
  if (consumed.count !== 1) throw new SiweError("Nonce missing, used, or expired.");

  return { address: getAddress(siwe.address) };
}

export async function verifySiwe(message: string, signature: string): Promise<SiweVerifyResult> {
  const { address } = await verifySiweSignature(message, signature);
  const existing = await prisma.linkedWallet.findUnique({
    where: { address },
    include: { user: true },
  });
  if (existing) {
    await prisma.linkedWallet.update({ where: { address }, data: { verifiedAt: new Date() } });
    return { user: existing.user, address };
  }

  // Unknown wallet at LOGIN → a fresh wallet-native account. (Linking a wallet
  // to an EXISTING email account is the separate /api/wallet/link flow.)
  const user = await prisma.user.create({
    data: {
      linkedWallets: { create: { address, chain: "EVM", verifiedAt: new Date() } },
      application: { create: { status: "DRAFT" } },
    },
  });
  return { user, address };
}
