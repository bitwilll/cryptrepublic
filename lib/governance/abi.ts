import { parseAbi } from "viem";

/**
 * FROZEN — byte-matches the `contracts/src/CryptGovernance.sol` external surface.
 * NOTE the real on-chain `State` enum has `Queued` between `Defeated` and
 * `Succeeded` (a passed-but-still-delayed proposal is `Queued`). `getVotes` is
 * preferred over the full `proposals()` struct getter off-chain (the dynamic
 * `callData` member is expensive/stack-heavy).
 */
export const governanceAbi = parseAbi([
  "function proposalCount() view returns (uint256)",
  "function getVotes(uint256 proposalId) view returns (uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 snapshotCitizens)",
  "function state(uint256 proposalId) view returns (uint8)", // State enum
  "function voteByPassport(uint256 proposalId, uint256 tokenId) view returns (uint8)", // Vote enum
  "function quorumBps() view returns (uint16)",
  "function votingPeriod() view returns (uint256)",
  "function minCitizensForProposal() view returns (uint256)",
  "function proposals(uint256) view returns (address proposer, uint64 start, uint64 end, uint256 snapshotCitizens, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, bool executed, bool cancelled, bytes32 descriptionHash, address target, uint256 value, bytes callData)",
  "function propose(address target, uint256 value, bytes callData, bytes32 descriptionHash) returns (uint256 proposalId)",
  "function castVote(uint256 proposalId, uint256 tokenId, uint8 support)",
  "event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address target, bytes32 descriptionHash)",
  "event VoteCast(uint256 indexed proposalId, uint256 indexed tokenId, address indexed voter, uint8 support)",
]);

/** Vote enum — matches CryptGovernance.Vote { None, For, Against, Abstain }. */
export const VOTE = { None: 0, For: 1, Against: 2, Abstain: 3 } as const;

/** State enum labels — INDEXED by the on-chain State enum ordinal (Queued between Defeated and Succeeded). */
export const PROPOSAL_STATE = [
  "Pending",
  "Active",
  "Defeated",
  "Queued",
  "Succeeded",
  "Executed",
  "Cancelled",
] as const;
