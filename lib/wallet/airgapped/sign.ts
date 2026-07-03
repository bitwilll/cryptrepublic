import "client-only";
import { withEvmSigner } from "@/lib/wallet/embedded/session";
import type { UnsignedEnvelope, SignedEnvelope } from "./codec";

/**
 * OFFLINE SIGNER (Wave 11 C5): sign a scanned unsigned envelope with the
 * UNLOCKED embedded key and return the SIGNED envelope. This module NEVER
 * broadcasts — no network call whatsoever (boundary.test.ts greps it for
 * broadcast/RPC/fetch); the signed raw tx travels back by QR. Unlock-gated
 * (withEvmSigner throws when locked). Mirrors the EXACT signTransaction call
 * sendEvm makes.
 */
export async function signUnsignedEnvelope(env: UnsignedEnvelope): Promise<SignedEnvelope> {
  return withEvmSigner(async (account) => {
    if (!account.signTransaction) throw new Error("Signer cannot sign transactions.");
    const raw = await account.signTransaction({
      chainId: env.chainId,
      nonce: env.tx.nonce,
      to: env.tx.to,
      value: env.tx.value,
      data: env.tx.data,
      gas: env.tx.gas,
      maxFeePerGas: env.tx.maxFeePerGas,
      maxPriorityFeePerGas: env.tx.maxPriorityFeePerGas,
      type: "eip1559",
    });
    return { v: 1, t: "cr-eth-tx-signed", raw };
  });
}
