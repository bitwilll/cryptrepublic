import "client-only";
import { encodeFunctionData, parseEventLogs, type Account, type WalletClient } from "viem";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import { withEvmSigner } from "@/lib/wallet/embedded/session";
import { governanceAddress } from "@/config/contracts";
import { governanceAbi } from "./abi";

/**
 * CryptGovernance writes — USER-signed, non-custodial. The EMBEDDED path uses the
 * FROZEN `writeEmbedded` pattern (copied VERBATIM from
 * lib/wallet/services/staking.ts): simulate (eth_call dry-run) -> withEvmSigner
 * -> account.signTransaction({type:"eip1559"}) -> sendRawTransaction ->
 * waitForTransactionReceipt -> THROW on non-success. NEVER `eth_sendTransaction`
 * / `writeContract` on embedded. The EXTERNAL path uses wagmi `writeContract`
 * (mirrors lib/passport/mint.ts submitMintExternal) — the only legit writeContract.
 * Votes are keyed by passport tokenId (castVote requires ownerOf(tokenId)==caller).
 */

/**
 * FROZEN embedded write — copied VERBATIM from staking.ts. simulate -> sign
 * eip1559 locally -> sendRawTransaction -> await receipt + throw on revert.
 */
async function writeEmbedded(
  chainId: number,
  to: `0x${string}`,
  functionName: string,
  args: readonly unknown[],
): Promise<`0x${string}`> {
  const client = publicClientFor(chainId);
  const data = encodeFunctionData({ abi: governanceAbi, functionName, args } as never);

  return withEvmSigner(async (account: Account) => {
    await client.simulateContract({
      account,
      address: to,
      abi: governanceAbi,
      functionName,
      args,
    } as never);

    const [nonce, fees] = await Promise.all([
      client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      client.estimateFeesPerGas(),
    ]);
    const gas = await client.estimateGas({ account: account.address, to, value: 0n, data });

    if (!account.signTransaction) {
      throw new Error("Signer cannot sign transactions.");
    }
    const serializedTransaction = await account.signTransaction({
      chainId,
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
      throw new Error(`${functionName} transaction reverted.`);
    }
    return txHash;
  });
}

/** EMBEDDED castVote(proposalId, tokenId, support). Passport-gated on-chain. */
export function castVoteEmbedded(
  chainId: number,
  proposalId: bigint,
  tokenId: bigint,
  support: number,
): Promise<`0x${string}`> {
  return writeEmbedded(chainId, governanceAddress(chainId), "castVote", [
    proposalId,
    tokenId,
    support,
  ]);
}

/** EXTERNAL (wagmi) castVote — the wallet extension broadcasts. */
export async function castVoteExternal(
  walletClient: WalletClient,
  chainId: number,
  proposalId: bigint,
  tokenId: bigint,
  support: number,
): Promise<`0x${string}`> {
  const client = publicClientFor(chainId);
  const to = governanceAddress(chainId);
  const account = walletClient.account;
  if (!account) throw new Error("External wallet has no account.");
  const { request } = await client.simulateContract({
    account,
    address: to,
    abi: governanceAbi,
    functionName: "castVote",
    args: [proposalId, tokenId, support],
  });
  const txHash = await walletClient.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("castVote transaction reverted.");
  }
  return txHash;
}

/** Parse the proposalId out of a receipt's ProposalCreated log. */
function parseProposalId(receipt: { logs: readonly unknown[] }): bigint {
  const parsed = parseEventLogs({
    abi: governanceAbi,
    eventName: "ProposalCreated",
    logs: receipt.logs as never,
  });
  if (parsed.length === 0) {
    throw new Error("propose receipt has no ProposalCreated event.");
  }
  return parsed[0].args.proposalId as bigint;
}

/**
 * EMBEDDED propose(target, value, callData, descriptionHash). For a pure
 * off-chain-content (signalling) proposal use target=0x0, value=0, callData=0x
 * and a real descriptionHash. simulate -> sign -> broadcast -> parse ProposalCreated.
 */
export function proposeEmbedded(
  chainId: number,
  target: `0x${string}`,
  value: bigint,
  callData: `0x${string}`,
  descriptionHash: `0x${string}`,
): Promise<{ txHash: `0x${string}`; proposalId: bigint }> {
  const client = publicClientFor(chainId);
  const to = governanceAddress(chainId);
  const data = encodeFunctionData({
    abi: governanceAbi,
    functionName: "propose",
    args: [target, value, callData, descriptionHash],
  });

  return withEvmSigner(async (account: Account) => {
    await client.simulateContract({
      account,
      address: to,
      abi: governanceAbi,
      functionName: "propose",
      args: [target, value, callData, descriptionHash],
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
      chainId,
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
      throw new Error("propose transaction reverted.");
    }
    return { txHash, proposalId: parseProposalId(receipt) };
  });
}

/** EXTERNAL (wagmi) propose — the wallet extension broadcasts. */
export async function proposeExternal(
  walletClient: WalletClient,
  chainId: number,
  target: `0x${string}`,
  value: bigint,
  callData: `0x${string}`,
  descriptionHash: `0x${string}`,
): Promise<{ txHash: `0x${string}`; proposalId: bigint }> {
  const client = publicClientFor(chainId);
  const to = governanceAddress(chainId);
  const account = walletClient.account;
  if (!account) throw new Error("External wallet has no account.");
  const { request } = await client.simulateContract({
    account,
    address: to,
    abi: governanceAbi,
    functionName: "propose",
    args: [target, value, callData, descriptionHash],
  });
  const txHash = await walletClient.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("propose transaction reverted.");
  }
  return { txHash, proposalId: parseProposalId(receipt) };
}
