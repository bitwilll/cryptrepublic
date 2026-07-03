import "client-only";
import { erc20Abi, type Account, type WalletClient } from "viem";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { publicClientFor } from "./evmClients";
import { buildCall, type EvmSendRequest } from "./call";
import { requireSeed, withEvmSigner } from "@/lib/wallet/embedded/session";
import { solanaKeypair } from "@/lib/wallet/embedded/derive";

// Wave 11 C2: the tx-shape primitives live in the SIGNER-FREE ./call module
// (shared with the watch-only air-gapped build path, which must never import
// this file — send.ts transitively pulls the embedded signer). Re-exported
// here for backward compat.
export { buildCall, type EvmSendRequest } from "./call";

/**
 * Send layer. The embedded wallet signs LOCALLY with a transient account and
 * broadcasts a raw/serialized transaction via a `/api/*` proxy. The proxy never
 * signs. JSON-RPC errors from the proxy surface as thrown viem errors — they are
 * NEVER swallowed into a fake success.
 *
 * BTC send is a flagged fast-follow (PSBT) and is DISABLED in v1 (receive-only).
 */

export interface SendPreview {
  to: string;
  amount: string;
  token: string;
  chainId: number;
  /** Estimated max fee in wei (gas * maxFeePerGas), as a decimal string. */
  feeEstimate: string;
}

/** Estimate gas + EIP-1559 fees; returns a human-facing preview. */
export async function previewEvmSend(
  req: EvmSendRequest,
  from: `0x${string}`,
): Promise<SendPreview> {
  const client = publicClientFor(req.chainId);
  const call = buildCall(req);
  const fees = await client.estimateFeesPerGas();
  const gas = await client.estimateGas({
    account: from,
    to: call.to,
    value: call.value,
    data: call.data,
  });
  const feeWei = gas * fees.maxFeePerGas;
  return {
    to: req.to,
    amount: req.amount.toString(),
    token: req.token ?? "native",
    chainId: req.chainId,
    feeEstimate: feeWei.toString(),
  };
}

/**
 * Sign an EIP-1559 tx locally with the transient account and broadcast the raw
 * tx via the proxy. Unlock-gated. Returns the tx hash. A proxy JSON-RPC error
 * (nonce/revert/etc.) propagates as a thrown viem error.
 */
export async function sendEvm(req: EvmSendRequest): Promise<`0x${string}`> {
  const client = publicClientFor(req.chainId);
  const call = buildCall(req);

  return withEvmSigner(async (account: Account) => {
    const [nonce, fees] = await Promise.all([
      client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      client.estimateFeesPerGas(),
    ]);
    const gas = await client.estimateGas({
      account: account.address,
      to: call.to,
      value: call.value,
      data: call.data,
    });

    if (!account.signTransaction) {
      throw new Error("Signer cannot sign transactions.");
    }
    const serializedTransaction = await account.signTransaction({
      chainId: req.chainId,
      nonce,
      to: call.to,
      value: call.value,
      data: call.data,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      type: "eip1559",
    });

    // viem surfaces a JSON-RPC `{error:{...}}` from the proxy as a thrown error.
    return client.sendRawTransaction({ serializedTransaction });
  });
}

/**
 * EXTERNAL wallet (wagmi/hardware) plain SEND (Wave 11 B1). The wallet's OWN
 * signer signs and broadcasts — this app never sees the key. Native →
 * walletClient.sendTransaction; ERC-20 → writeContract(erc20.transfer) (the
 * wallet encodes + estimates + broadcasts). `chain: null` uses the wallet's
 * connected chain — the correct-chain guard lives in the UI before this is
 * called. A user rejection / wrong chain propagates as a thrown error (never
 * a false success).
 */
export async function sendEvmExternal(
  walletClient: WalletClient,
  req: EvmSendRequest,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("External wallet has no account.");
  if (req.token) {
    return walletClient.writeContract({
      account,
      chain: null,
      address: req.token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [req.to, req.amount],
    });
  }
  return walletClient.sendTransaction({ account, chain: null, to: req.to, value: req.amount });
}

/**
 * Send SOL via `SystemProgram.transfer`, signed by the derived ed25519 Keypair,
 * broadcast through the Solana proxy. Unlock-gated.
 */
export async function sendSolana(to: string, lamports: bigint): Promise<string> {
  const seed = requireSeed(); // throws when locked
  const keypair = solanaKeypair(seed);
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  const connection = new Connection(`${origin}/api/rpc/solana`, "confirmed");
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: keypair.publicKey,
    recentBlockhash: blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(to),
      lamports: Number(lamports),
    }),
  );
  tx.sign(keypair);
  const raw = tx.serialize();
  return connection.sendRawTransaction(raw);
}

/** BTC send is a flagged fast-follow (PSBT). Receive-only in v1. */
export const BTC_SEND_ENABLED = false;

export function sendBitcoin(): never {
  throw new Error(
    "BTC send not available in v1 (receive-only). PSBT send is a flagged fast-follow.",
  );
}
