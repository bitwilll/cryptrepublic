import { parseAbi } from "viem";

/**
 * FROZEN — byte-matches the `contracts/src/CryptTreasury.sol` external surface.
 * `balanceOf(address(0))` returns the ETH balance; any other token is that
 * ERC-20's balance. Allocations are on-chain TARGET basis points (governance
 * intent), not live splits.
 */
export const treasuryAbi = parseAbi([
  "function balanceOf(address token) view returns (uint256)",
  "function allocationBps(bytes32 bucket) view returns (uint16)",
  "function totalAllocationBps() view returns (uint16)",
  "function assetWhitelist(address token) view returns (bool)",
  "function crypt() view returns (address)",
  "event Disbursed(address indexed token, address indexed to, uint256 amount)",
  "event DividendsFunded(address indexed distributor, uint256 amount, uint256 indexed epochId)",
]);
