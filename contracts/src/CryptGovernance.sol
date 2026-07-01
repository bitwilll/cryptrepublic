// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPassport} from "./interfaces/IPassport.sol";

/// @title CryptGovernance — one passport = one vote (NOT token-weighted).
contract CryptGovernance is AccessControl, ReentrancyGuard {
    enum State {
        Pending,
        Active,
        Defeated,
        Queued, // succeeded, but still within the execution-delay timelock window
        Succeeded, // succeeded AND the execution delay has elapsed -> executable
        Executed,
        Cancelled
    }

    enum Vote {
        None,
        For,
        Against,
        Abstain
    }

    struct Proposal {
        address proposer;
        uint64 start;
        uint64 end;
        uint256 snapshotCitizens;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool executed;
        bool cancelled;
        bytes32 descriptionHash;
        address target;
        uint256 value;
        bytes callData;
    }

    IPassport public immutable passport;
    uint256 public votingPeriod; // seconds
    uint16 public quorumBps;
    uint256 public executionDelay; // seconds after voting end before execute() is allowed
    uint256 public minCitizensForProposal; // floor so a tiny republic can't self-pass a drain

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(uint256 => Vote)) public voteByPassport; // proposalId => tokenId => vote
    mapping(address => bool) public targetAllowed; // execution allowlist (Treasury only)
    uint256 public proposalCount;

    error NotCitizen();
    error NotTokenOwner();
    error AlreadyVoted();
    error VotingClosed();
    error NotSucceeded();
    error AlreadyExecuted();
    error AlreadyCancelled();
    error TargetNotAllowed();
    error EmptyPayload();
    error ExecutionFailed();
    error ZeroAddress();
    error NotEnoughCitizens(); // propose blocked below the min-citizens floor
    error TimelockNotElapsed(); // execute blocked before end + executionDelay
    error InvalidVote();
    error Unauthorized();

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address target,
        bytes32 descriptionHash
    );
    event VoteCast(
        uint256 indexed proposalId, uint256 indexed tokenId, address indexed voter, Vote support
    );
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId);
    event VotingPeriodSet(uint256 period);
    event QuorumBpsSet(uint16 bps);
    event ExecutionDelaySet(uint256 delay);
    event MinCitizensForProposalSet(uint256 minCitizens);
    event TargetAllowedSet(address indexed target, bool ok);

    constructor(
        address admin,
        IPassport passport_,
        uint256 votingPeriod_,
        uint16 quorumBps_,
        uint256 executionDelay_,
        uint256 minCitizensForProposal_
    ) {
        if (admin == address(0) || address(passport_) == address(0)) revert ZeroAddress();
        require(quorumBps_ <= 10_000, "quorum>100%");
        require(minCitizensForProposal_ >= 1, "minCitizens<1"); // never allow a 0 floor
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        passport = passport_;
        votingPeriod = votingPeriod_;
        quorumBps = quorumBps_;
        executionDelay = executionDelay_;
        minCitizensForProposal = minCitizensForProposal_;
    }

    function propose(
        address target,
        uint256 value,
        bytes calldata callData,
        bytes32 descriptionHash
    ) external returns (uint256 proposalId) {
        if (!passport.isCitizen(msg.sender)) revert NotCitizen();
        uint256 citizens = passport.totalCitizens();
        if (citizens < minCitizensForProposal) revert NotEnoughCitizens();
        proposalId = ++proposalCount;
        Proposal storage p = proposals[proposalId];
        p.proposer = msg.sender;
        p.start = uint64(block.timestamp);
        p.end = uint64(block.timestamp + votingPeriod);
        p.snapshotCitizens = citizens; // quorum denominator snapshot
        p.descriptionHash = descriptionHash;
        p.target = target;
        p.value = value;
        p.callData = callData;
        emit ProposalCreated(proposalId, msg.sender, target, descriptionHash);
    }

    function castVote(uint256 proposalId, uint256 tokenId, Vote support) external {
        Proposal storage p = proposals[proposalId];
        if (block.timestamp < p.start || block.timestamp > p.end) revert VotingClosed();
        if (support == Vote.None) revert InvalidVote();
        if (passport.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (voteByPassport[proposalId][tokenId] != Vote.None) revert AlreadyVoted();

        voteByPassport[proposalId][tokenId] = support; // effects before any external interaction
        if (support == Vote.For) p.forVotes += 1;
        else if (support == Vote.Against) p.againstVotes += 1;
        else p.abstainVotes += 1;
        emit VoteCast(proposalId, tokenId, msg.sender, support);
    }

    /// @notice Vote tallies + quorum snapshot for a proposal (avoids the full struct getter, whose
    ///         dynamic `callData` member is expensive to ABI-encode / can hit stack limits off-chain).
    function getVotes(uint256 proposalId)
        external
        view
        returns (
            uint256 forVotes,
            uint256 againstVotes,
            uint256 abstainVotes,
            uint256 snapshotCitizens
        )
    {
        Proposal storage p = proposals[proposalId];
        return (p.forVotes, p.againstVotes, p.abstainVotes, p.snapshotCitizens);
    }

    function state(uint256 proposalId) public view returns (State) {
        Proposal storage p = proposals[proposalId];
        if (p.proposer == address(0)) return State.Pending; // nonexistent -> Pending sentinel
        if (p.cancelled) return State.Cancelled;
        if (p.executed) return State.Executed;
        if (block.timestamp <= p.end) return State.Active;
        bool quorumMet = (p.forVotes + p.abstainVotes) * 10_000 >= p.snapshotCitizens * quorumBps;
        if (quorumMet && p.forVotes > p.againstVotes) {
            if (block.timestamp < uint256(p.end) + executionDelay) return State.Queued;
            return State.Succeeded;
        }
        return State.Defeated;
    }

    function execute(uint256 proposalId) external nonReentrant returns (bytes memory) {
        Proposal storage p = proposals[proposalId];
        State s = state(proposalId);
        // A passed-but-still-delayed proposal is `Queued`; revert with a dedicated error so the
        // "not yet" case is unambiguous vs. a plain failed vote.
        if (s == State.Queued) revert TimelockNotElapsed();
        // state() already returns Executed once executed, so `s != Succeeded` covers re-execution.
        if (s != State.Succeeded) revert NotSucceeded();
        if (p.callData.length == 0) revert EmptyPayload(); // signalling proposals are not executable
        if (!targetAllowed[p.target]) revert TargetNotAllowed();

        p.executed = true; // effects before interaction
        (bool ok, bytes memory ret) = p.target.call{value: p.value}(p.callData);
        if (!ok) revert ExecutionFailed();
        emit ProposalExecuted(proposalId);
        return ret;
    }

    function cancel(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (msg.sender != p.proposer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized();
        }
        if (p.executed) revert AlreadyExecuted();
        if (p.cancelled) revert AlreadyCancelled();
        p.cancelled = true;
        emit ProposalCancelled(proposalId);
    }

    function setVotingPeriod(uint256 period) external onlyRole(DEFAULT_ADMIN_ROLE) {
        votingPeriod = period;
        emit VotingPeriodSet(period);
    }

    function setQuorumBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps <= 10_000, "quorum>100%");
        quorumBps = bps;
        emit QuorumBpsSet(bps);
    }

    function setExecutionDelay(uint256 delay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        executionDelay = delay;
        emit ExecutionDelaySet(delay);
    }

    function setMinCitizensForProposal(uint256 minCitizens) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(minCitizens >= 1, "minCitizens<1"); // never a 0 floor
        minCitizensForProposal = minCitizens;
        emit MinCitizensForProposalSet(minCitizens);
    }

    function setTargetAllowed(address target, bool ok) external onlyRole(DEFAULT_ADMIN_ROLE) {
        targetAllowed[target] = ok;
        emit TargetAllowedSet(target, ok);
    }

    receive() external payable {}
}
