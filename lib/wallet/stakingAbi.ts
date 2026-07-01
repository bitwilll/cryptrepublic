import "client-only";
import { parseAbi } from "viem";

/** FROZEN — byte-matches contracts/src/CryptStaking.sol external surface. */
export const stakingAbi = parseAbi([
  "function stake(uint256 amount)",
  "function unstake(uint256 amount)",
  "function claim()",
  "function stakes(address) view returns (uint256 amount, uint256 rewardAccrued, uint256 userRewardPerTokenPaid)",
  "function earned(address user) view returns (uint256)",
  "function aprBps() view returns (uint16)",
  "function totalStaked() view returns (uint256)",
  "function rewardPoolRemaining() view returns (uint256)",
]);

/** ERC-20 approve/allowance (for $CRYPT -> staking). */
export const erc20ApproveAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
