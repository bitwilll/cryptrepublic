import "client-only";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import { buildCall, type EvmSendRequest } from "@/lib/wallet/services/call";
import type { UnsignedEnvelope } from "./codec";

/**
 * WATCH-ONLY unsigned-tx builder (Wave 11 C2). Builds the SAME EIP-1559
 * params `sendEvm` would sign — nonce (pending), fee estimate, gas estimate —
 * for a WATCHED `from` address, and wraps them in the versioned envelope.
 *
 * CUSTODY BOUNDARY: this module holds NO key. It imports the tx shape from
 * the SIGNER-FREE services/call module — NEVER services/send, which
 * transitively imports the embedded signer (enforced by boundary.test.ts).
 */
export async function buildUnsignedTx(
  req: EvmSendRequest,
  from: `0x${string}`,
): Promise<UnsignedEnvelope> {
  const client = publicClientFor(req.chainId);
  const call = buildCall(req);
  const [nonce, fees] = await Promise.all([
    client.getTransactionCount({ address: from, blockTag: "pending" }),
    client.estimateFeesPerGas(),
  ]);
  const gas = await client.estimateGas({
    account: from,
    to: call.to,
    value: call.value,
    data: call.data,
  });
  return {
    v: 1,
    t: "cr-eth-tx-unsigned",
    chainId: req.chainId,
    tx: {
      to: call.to,
      value: call.value,
      ...(call.data !== undefined ? { data: call.data } : {}),
      nonce,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    },
  };
}
