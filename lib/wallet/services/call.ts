import "client-only";
import { encodeFunctionData, erc20Abi } from "viem";

/**
 * SIGNER-FREE tx-shape module (Wave 11 C2). This file exists so the WATCH-ONLY
 * air-gapped build path can share the exact `{to, value, data}` encoding with
 * the embedded send path WITHOUT importing `send.ts` — which transitively
 * imports the embedded signer (`embedded/session` + `embedded/derive`) and
 * would silently pull key-handling code into the watch-only module graph.
 * CUSTODY BOUNDARY: this module must never import `@/lib/wallet/embedded/*`
 * (enforced by lib/wallet/airgapped/boundary.test.ts).
 */

export interface EvmSendRequest {
  chainId: number;
  to: `0x${string}`;
  amount: bigint;
  /** ERC-20 contract; omit for a native transfer. */
  token?: `0x${string}`;
}

/**
 * Build the tx `{ to, value, data }` shell for a native or ERC-20 transfer.
 * NOTE the ERC-20 semantics: `to` is the TOKEN CONTRACT and `value` is 0 — the
 * real recipient + amount live INSIDE `data` (any honest human-readable review
 * must decode the calldata; see airgapped/codec.ts decodeEnvelopeForDisplay).
 */
export function buildCall(req: EvmSendRequest): {
  to: `0x${string}`;
  value: bigint;
  data?: `0x${string}`;
} {
  if (req.token) {
    return {
      to: req.token,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [req.to, req.amount],
      }),
    };
  }
  return { to: req.to, value: req.amount };
}
