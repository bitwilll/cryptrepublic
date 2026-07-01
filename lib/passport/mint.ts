import "client-only";
import {
  encodeFunctionData,
  parseEventLogs,
  type Account,
  type Address,
  type Hex,
  type WalletClient,
  type TransactionReceipt,
} from "viem";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import { withEvmSigner } from "@/lib/wallet/embedded/session";
import { passportAddress } from "@/config/contracts";
import { passportAbi } from "./abi";
import { readApplicantNonce } from "./client";
import type { Attestation } from "./attestation";

/**
 * Mint submit. The `mintWithWitnesses` transaction is signed and sent by the
 * USER'S OWN wallet — never the server, which holds no key.
 *
 * - EMBEDDED: `simulateContract` (eth_call dry-run ONLY) → `account.signTransaction`
 *   → `client.sendRawTransaction` (the `send.ts` pattern). It NEVER calls
 *   `writeContract` / `eth_sendTransaction` (the RPC allowlist rejects
 *   `eth_sendTransaction`).
 * - EXTERNAL: `simulateContract` → wagmi `walletClient.writeContract` (the wallet
 *   extension broadcasts — the ONLY path that legitimately uses `writeContract`).
 *
 * LOCAL/BOOTSTRAP: in the local e2e the 7 witness signatures come from anvil test
 * signers; in production they come from real existing citizens (Wave 5 follow-up
 * covers the social witness-discovery UX).
 */

export interface MintArgs {
  chainId: number;
  nameHash: Hex; // bytes32
  motto: Hex; // bytes32
  domicile: Hex; // bytes32
  oathAccepted: boolean;
  attestations: readonly Attestation[]; // length >= requiredWitnesses
  signatures: readonly Hex[]; // 1:1 with attestations
}

export interface MintResult {
  txHash: Hex;
  tokenId: bigint;
  mintBlock: bigint;
}

/** Thrown when the collected attestations' nonce no longer matches the on-chain applicant nonce. */
export class StaleAttestationsError extends Error {
  constructor(
    message = "attestations are stale — witnesses must re-sign (your on-chain nonce changed)",
  ) {
    super(message);
    this.name = "StaleAttestationsError";
  }
}

/** Encode the mintWithWitnesses calldata (pure — testable without a chain). */
export function encodeMintCall(args: MintArgs): Hex {
  return encodeFunctionData({
    abi: passportAbi,
    functionName: "mintWithWitnesses",
    args: [
      args.nameHash,
      args.motto,
      args.domicile,
      args.oathAccepted,
      args.attestations as Attestation[],
      args.signatures as Hex[],
    ],
  });
}

/** Extract tokenId + mintBlock from a receipt's CitizenMinted log. */
export function parseMintResult(receipt: { logs: readonly unknown[] }): {
  tokenId: bigint;
  mintBlock: bigint;
} {
  const parsed = parseEventLogs({
    abi: passportAbi,
    eventName: "CitizenMinted",
    // viem tolerates a minimal log shape here.
    logs: receipt.logs as never,
  });
  if (parsed.length === 0) {
    throw new Error("Mint receipt has no CitizenMinted event.");
  }
  const ev = parsed[0];
  return { tokenId: ev.args.tokenId, mintBlock: ev.args.mintBlock };
}

/**
 * BLOCKER — stale-nonce guard. Witness sigs are built against the nonce read at
 * witnesses/request, but `mintWithWitnesses` consumes the applicant's CURRENT
 * on-chain nonce. Re-read it immediately before simulate; if it differs from the
 * nonce embedded in the collected attestations, throw — do NOT submit a
 * guaranteed-revert tx. All attestations for one applicant share one nonce (the
 * single-outstanding-request invariant).
 */
export async function assertAttestationsFresh(chainId: number, args: MintArgs): Promise<void> {
  if (args.attestations.length === 0) {
    throw new StaleAttestationsError("no attestations collected");
  }
  const applicant = args.attestations[0].applicant as Address;
  const embeddedNonce = args.attestations[0].nonce;
  const current = await readApplicantNonce(chainId, applicant);
  if (current !== embeddedNonce) {
    throw new StaleAttestationsError();
  }
}

function receiptToResult(txHash: Hex, receipt: TransactionReceipt): MintResult {
  const { tokenId, mintBlock } = parseMintResult(receipt as unknown as { logs: [] });
  return { txHash, tokenId, mintBlock };
}

/**
 * EMBEDDED wallet: re-read applicant nonce (stale-check) → simulate (eth_call
 * dry-run ONLY, surfacing any revert reason) → sign locally (withEvmSigner) →
 * sendRawTransaction via proxy → wait → parse CitizenMinted. NEVER uses
 * writeContract / eth_sendTransaction.
 */
export async function submitMintEmbedded(args: MintArgs): Promise<MintResult> {
  await assertAttestationsFresh(args.chainId, args); // fail fast, no tx on drift
  const client = publicClientFor(args.chainId);
  const to = passportAddress(args.chainId);
  const data = encodeMintCall(args);

  return withEvmSigner(async (account: Account) => {
    // Dry-run via eth_call ONLY. A revert (NotEnoughWitnesses / AlreadyCitizen /
    // BadNonce / SelfAttestation / …) surfaces as a thrown viem error — never a
    // fake success (mirrors send.ts).
    await client.simulateContract({
      account,
      address: to,
      abi: passportAbi,
      functionName: "mintWithWitnesses",
      args: [
        args.nameHash,
        args.motto,
        args.domicile,
        args.oathAccepted,
        args.attestations as Attestation[],
        args.signatures as Hex[],
      ],
    });

    const [nonce, fees] = await Promise.all([
      client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      client.estimateFeesPerGas(),
    ]);
    const gas = await client.estimateGas({ account: account.address, to, value: 0n, data });

    if (!account.signTransaction) {
      throw new Error("Signer cannot sign transactions.");
    }
    const serializedTransaction = await account.signTransaction({
      chainId: args.chainId,
      nonce,
      to,
      value: 0n,
      data,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      type: "eip1559",
    });

    const txHash = await client.sendRawTransaction({ serializedTransaction });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error("Mint transaction reverted.");
    }
    return receiptToResult(txHash, receipt);
  });
}

/**
 * EXTERNAL wallet (wagmi): re-read nonce (stale-check) → simulate → the wallet
 * client's `writeContract` (the wallet extension broadcasts) → wait → parse.
 */
export async function submitMintExternal(
  args: MintArgs,
  walletClient: WalletClient,
): Promise<MintResult> {
  await assertAttestationsFresh(args.chainId, args);
  const client = publicClientFor(args.chainId);
  const to = passportAddress(args.chainId);
  const account = walletClient.account;
  if (!account) throw new Error("External wallet has no account.");

  const { request } = await client.simulateContract({
    account,
    address: to,
    abi: passportAbi,
    functionName: "mintWithWitnesses",
    args: [
      args.nameHash,
      args.motto,
      args.domicile,
      args.oathAccepted,
      args.attestations as Attestation[],
      args.signatures as Hex[],
    ],
  });

  const txHash = await walletClient.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Mint transaction reverted.");
  }
  return receiptToResult(txHash, receipt);
}
