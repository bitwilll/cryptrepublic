import "client-only";
import { encodeFunctionData, type Account } from "viem";
import { publicClientFor } from "./evmClients";
import { withEvmSigner } from "@/lib/wallet/embedded/session";
import { contractEntry, stakingAddress } from "@/config/contracts";
import { stakingAbi, erc20ApproveAbi } from "@/lib/wallet/stakingAbi";

/**
 * Staking service. Reads go through `publicClientFor(chainId)` -> `/api/rpc/<id>`
 * (CSP-safe). Writes (approve/stake/unstake/claim) are USER-signed and
 * non-custodial: the embedded wallet signs an EIP-1559 tx LOCALLY and broadcasts
 * a RAW tx via the proxy. NEVER `eth_sendTransaction` / `writeContract` on the
 * embedded path (the allowlist rejects `eth_sendTransaction`).
 *
 * $CRYPT ALWAYS resolves from `config/contracts.ts` `token` (NOT tokens.ts, where
 * CRYPT is an address-less placeholder). Staking address from `stakingAddress`.
 */

export interface StakePosition {
  staked: bigint; // stakes(user).amount
  earned: bigint; // earned(user) — CAPPED by rewardPoolRemaining on claim
  aprBps: number; // aprBps() (global, basis points) — display = aprBps/100 %
  totalStaked: bigint; // TVL
  rewardPoolRemaining: bigint;
}

/** The registered $CRYPT token address for a chain (throws when unregistered). */
function cryptTokenAddress(chainId: number): `0x${string}` {
  const addr = contractEntry(chainId).token;
  if (!addr) {
    throw new Error(`$CRYPT token not deployed on chain ${chainId}`);
  }
  return addr;
}

/** True when the STAKE affordance is available (token + staking both registered). */
export function stakingAvailable(chainId: number): boolean {
  const entry = contractEntry(chainId);
  return Boolean(entry.token) && Boolean(entry.staking);
}

/** All reads for the stake panel, in parallel, from config token + staking. */
export async function readStakePosition(
  chainId: number,
  user: `0x${string}`,
): Promise<StakePosition> {
  const client = publicClientFor(chainId);
  const staking = stakingAddress(chainId);
  const [stakes, earned, aprBps, totalStaked, rewardPoolRemaining] = await Promise.all([
    client.readContract({
      address: staking,
      abi: stakingAbi,
      functionName: "stakes",
      args: [user],
    }),
    client.readContract({
      address: staking,
      abi: stakingAbi,
      functionName: "earned",
      args: [user],
    }),
    client.readContract({ address: staking, abi: stakingAbi, functionName: "aprBps" }),
    client.readContract({ address: staking, abi: stakingAbi, functionName: "totalStaked" }),
    client.readContract({ address: staking, abi: stakingAbi, functionName: "rewardPoolRemaining" }),
  ]);
  // `stakes` is a 3-tuple [amount, rewardAccrued, userRewardPerTokenPaid]; [0] = principal.
  const staked = (stakes as readonly bigint[])[0];
  return {
    staked,
    earned: earned as bigint,
    aprBps: Number(aprBps),
    totalStaked: totalStaked as bigint,
    rewardPoolRemaining: rewardPoolRemaining as bigint,
  };
}

/** Current $CRYPT allowance the user has granted the staking contract. */
export function readCryptAllowance(chainId: number, owner: `0x${string}`): Promise<bigint> {
  const client = publicClientFor(chainId);
  return client.readContract({
    address: cryptTokenAddress(chainId),
    abi: erc20ApproveAbi,
    functionName: "allowance",
    args: [owner, stakingAddress(chainId)],
  }) as Promise<bigint>;
}

/**
 * Shared embedded write: simulate (eth_call dry-run ONLY) -> sign eip1559 locally
 * (withEvmSigner) -> sendRawTransaction -> AWAIT the receipt + throw on revert.
 * MATCHES lib/passport/mint.ts's `submitMintEmbedded` post-broadcast confirmation:
 * a reverted tx still broadcasts, so returning its hash as "success" would be a
 * correctness bug. NEVER uses writeContract / eth_sendTransaction.
 */
async function writeEmbedded(
  chainId: number,
  to: `0x${string}`,
  abi: typeof stakingAbi | typeof erc20ApproveAbi,
  functionName: string,
  args: readonly unknown[],
): Promise<`0x${string}`> {
  const client = publicClientFor(chainId);
  const data = encodeFunctionData({ abi, functionName, args } as never);

  return withEvmSigner(async (account: Account) => {
    // Dry-run via eth_call ONLY. A revert surfaces as a thrown viem error.
    await client.simulateContract({
      account,
      address: to,
      abi,
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
    // Post-broadcast confirmation — MATCHES mint.ts. A reverted tx still
    // broadcasts; only report success after the receipt confirms it.
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`${functionName} transaction reverted.`);
    }
    return txHash;
  });
}

/** EMBEDDED approve of EXACTLY `amount` $CRYPT to the staking contract. */
export function approveCryptEmbedded(chainId: number, amount: bigint): Promise<`0x${string}`> {
  return writeEmbedded(chainId, cryptTokenAddress(chainId), erc20ApproveAbi, "approve", [
    stakingAddress(chainId),
    amount,
  ]);
}

/** EMBEDDED stake of `amount` $CRYPT (allowance must already cover it). */
export function stakeEmbedded(chainId: number, amount: bigint): Promise<`0x${string}`> {
  return writeEmbedded(chainId, stakingAddress(chainId), stakingAbi, "stake", [amount]);
}

/** EMBEDDED unstake of `amount` $CRYPT. */
export function unstakeEmbedded(chainId: number, amount: bigint): Promise<`0x${string}`> {
  return writeEmbedded(chainId, stakingAddress(chainId), stakingAbi, "unstake", [amount]);
}

/** EMBEDDED claim of accrued rewards (payout capped by rewardPoolRemaining on-chain). */
export function claimEmbedded(chainId: number): Promise<`0x${string}`> {
  return writeEmbedded(chainId, stakingAddress(chainId), stakingAbi, "claim", []);
}
