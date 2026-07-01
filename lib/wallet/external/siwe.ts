import "client-only";
import { SiweMessage } from "siwe";
import { activeChain } from "@/lib/config/chain";

/**
 * Client SIWE integration for EXTERNAL wallets. The Wave 2 SIWE server
 * (`lib/auth/siwe.ts`) is authoritative and MUST NOT be changed; this module
 * only builds the message + drives the handshake.
 *
 * CRITICAL: the Wave 2 server allow-lists ONLY the PRIMARY chainId
 * (`ALLOWED_CHAIN_IDS`), but wagmi is configured with all 5 EVM chains. So the
 * signed message's chainId is FORCED to `activeChain().primaryChainId` — never
 * the connected wallet's chainId — or the server rejects it. The UI SHOULD
 * `useSwitchChain` to primary first for a truthful message, but the signed
 * chainId must be primary regardless.
 */

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Build a SIWE message string bound to our host+origin at the given chainId. */
export function buildSiweMessage(address: string, nonce: string, chainId: number): string {
  const url = new URL(appUrl());
  const message = new SiweMessage({
    domain: url.host,
    address,
    statement: "Sign in to CryptRepublic.",
    uri: url.origin,
    version: "1",
    chainId,
    nonce,
    issuedAt: new Date().toISOString(),
  });
  return message.prepareMessage();
}

export interface SiweAuthResult {
  ok: boolean;
  next?: string;
}

/**
 * Full handshake: GET nonce -> build message at the PRIMARY chainId ->
 * `personal_sign` (EIP-191) via the caller's `signMessage` -> POST to verify.
 * `credentials:"include"` so the session cookie is set on success.
 */
export async function connectAndAuthenticate(
  signMessage: (msg: string) => Promise<string>,
  address: string,
): Promise<SiweAuthResult> {
  const nonceRes = await fetch("/api/auth/siwe/nonce", { credentials: "include" });
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  // FORCE the primary chainId (the only one the Wave 2 server allow-lists).
  const chainId = activeChain().primaryChainId;
  const message = buildSiweMessage(address, nonce, chainId);
  const signature = await signMessage(message);

  const verifyRes = await fetch("/api/auth/siwe/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message, signature }),
  });
  return (await verifyRes.json()) as SiweAuthResult;
}
