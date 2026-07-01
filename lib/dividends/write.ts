import "client-only";
import { encodeFunctionData, type Account, type WalletClient } from "viem";
import { publicClientFor } from "@/lib/wallet/services/evmClients";
import { withEvmSigner } from "@/lib/wallet/embedded/session";
import { distributorAddress } from "@/config/contracts";
import { dividendsAbi } from "./abi";

/**
 * DividendDistributor writes — USER-signed, non-custodial. EMBEDDED path uses the
 * FROZEN `writeEmbedded` pattern (copied VERBATIM from staking.ts): simulate ->
 * withEvmSigner -> sign eip1559 -> sendRawTransaction -> waitForTransactionReceipt
 * -> THROW on non-success. NEVER `eth_sendTransaction` / `writeContract` on
 * embedded. EXTERNAL path uses wagmi `writeContract`. Claims are keyed by passport
 * tokenId (claim requires ownerOf(tokenId)==caller and !claimed).
 */

/** FROZEN embedded write — copied VERBATIM from staking.ts. */
async function writeEmbedded(
  chainId: number,
  to: `0x${string}`,
  functionName: string,
  args: readonly unknown[],
): Promise<`0x${string}`> {
  const client = publicClientFor(chainId);
  const data = encodeFunctionData({ abi: dividendsAbi, functionName, args } as never);

  return withEvmSigner(async (account: Account) => {
    await client.simulateContract({
      account,
      address: to,
      abi: dividendsAbi,
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

/** EMBEDDED claim(epochId, tokenId). tokenId-gated on-chain. */
export function claimDividendEmbedded(
  chainId: number,
  epochId: bigint,
  tokenId: bigint,
): Promise<`0x${string}`> {
  return writeEmbedded(chainId, distributorAddress(chainId), "claim", [epochId, tokenId]);
}

/** EMBEDDED claimMany(epochId, tokenIds[]). */
export function claimManyEmbedded(
  chainId: number,
  epochId: bigint,
  tokenIds: bigint[],
): Promise<`0x${string}`> {
  return writeEmbedded(chainId, distributorAddress(chainId), "claimMany", [epochId, tokenIds]);
}

/** EXTERNAL (wagmi) claim — the wallet extension broadcasts. */
export async function claimDividendExternal(
  walletClient: WalletClient,
  chainId: number,
  epochId: bigint,
  tokenId: bigint,
): Promise<`0x${string}`> {
  const client = publicClientFor(chainId);
  const to = distributorAddress(chainId);
  const account = walletClient.account;
  if (!account) throw new Error("External wallet has no account.");
  const { request } = await client.simulateContract({
    account,
    address: to,
    abi: dividendsAbi,
    functionName: "claim",
    args: [epochId, tokenId],
  });
  const txHash = await walletClient.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("claim transaction reverted.");
  }
  return txHash;
}
