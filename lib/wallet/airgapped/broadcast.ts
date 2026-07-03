import "client-only";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import { decodeSigned } from "./codec";

/**
 * WATCH-ONLY broadcast (Wave 11 C2): send a SCANNED signed raw tx through the
 * same allow-listed proxy call `sendEvm` uses (`eth_sendRawTransaction`). The
 * raw tx is public data — safe to relay. A proxy JSON-RPC error (nonce/
 * revert/…) propagates as a thrown viem error, never a fake success.
 *
 * CUSTODY BOUNDARY: no key, no signer import (enforced by boundary.test.ts).
 */
export async function broadcastSignedRaw(
  chainId: number,
  rawOrEnvelope: string,
): Promise<`0x${string}`> {
  const raw = decodeSigned(rawOrEnvelope);
  return publicClientFor(chainId).sendRawTransaction({ serializedTransaction: raw });
}
