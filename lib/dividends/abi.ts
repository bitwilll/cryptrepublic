import { parseAbi } from "viem";

/**
 * FROZEN — byte-matches the `contracts/src/DividendDistributor.sol` external
 * surface. `claimable(epochId, tokenId)` is the CONTRACT accrual (never derived
 * client-side). `claim`/`claimMany` are user-signed, non-custodial.
 */
export const dividendsAbi = parseAbi([
  "function currentEpoch() view returns (uint256)",
  "function epochs(uint256) view returns (uint256 amount, uint256 snapshotCitizens, uint256 perCitizen, uint64 openedAt, bool open)",
  "function claimable(uint256 epochId, uint256 tokenId) view returns (uint256)",
  "function claimed(uint256 epochId, uint256 tokenId) view returns (bool)",
  "function claim(uint256 epochId, uint256 tokenId)",
  "function claimMany(uint256 epochId, uint256[] tokenIds)",
  "event EpochOpened(uint256 indexed epochId, uint256 amount, uint256 snapshotCitizens, uint256 perCitizen)",
  "event DividendClaimed(uint256 indexed epochId, uint256 indexed tokenId, address indexed to, uint256 amount)",
]);
