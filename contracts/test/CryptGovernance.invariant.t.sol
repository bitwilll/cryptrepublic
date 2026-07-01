// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptGovernance} from "../src/CryptGovernance.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";
import {IPassport} from "../src/interfaces/IPassport.sol";

contract MockTgt {
    function noop() external {}
}

contract GovHandler is Test {
    CryptGovernance internal gov;
    CryptRepublicPassport internal p;
    address internal genesis;
    address[] internal citizens;
    uint256 public proposalId;
    uint64 internal proposalEnd;
    uint256 internal execDelay;
    address internal tgt;

    // mirror of votes cast: proposalId => tokenId => bool
    mapping(uint256 => mapping(uint256 => bool)) public votedMirror;
    uint256 public preDelayExecuteSuccess;

    constructor(
        CryptGovernance _gov,
        CryptRepublicPassport _p,
        address _genesis,
        uint256 _execDelay,
        address _tgt
    ) {
        gov = _gov;
        p = _p;
        genesis = _genesis;
        execDelay = _execDelay;
        tgt = _tgt;
        // mint 5 citizens up front (satisfies minCitizensForProposal)
        for (uint256 i; i < 5; i++) {
            address c = makeAddr(string.concat("gc", vm.toString(i)));
            citizens.push(c);
            vm.prank(genesis);
            p.genesisMint(c, keccak256(abi.encode(c)), bytes32("m"), bytes32("d"));
        }
        // open one proposal
        vm.prank(citizens[0]);
        proposalId = gov.propose(tgt, 0, abi.encodeWithSignature("noop()"), keccak256("d"));
        (,, uint64 end,) = _votesAndEnd();
        proposalEnd = end;
    }

    function _votesAndEnd()
        internal
        view
        returns (uint256 f, uint256 a, uint64 end, uint256 snap)
    {
        (uint256 fv, uint256 av,, uint256 s) = gov.getVotes(proposalId);
        return (fv, av, uint64(block.timestamp), s);
    }

    function vote(uint256 idx, uint8 support) external {
        uint256 i = idx % citizens.length;
        uint256 tokenId = i + 1;
        CryptGovernance.Vote v = CryptGovernance.Vote(uint8(1 + (support % 3))); // For/Against/Abstain
        vm.prank(citizens[i]);
        try gov.castVote(proposalId, tokenId, v) {
            votedMirror[proposalId][tokenId] = true;
        } catch {}
    }

    function warp(uint256 dt) external {
        dt = bound(dt, 0, 5 days);
        vm.warp(block.timestamp + dt);
    }

    function tryExecute() external {
        // Only counts as a violation if it SUCCEEDS while still within the timelock window.
        bool withinDelay = block.timestamp < uint256(proposalEnd) + execDelay;
        try gov.execute(proposalId) {
            if (withinDelay) preDelayExecuteSuccess++;
        } catch {}
    }

    function citizenCount() external view returns (uint256) {
        return citizens.length;
    }

    function tokenIds() external view returns (uint256[] memory ids) {
        ids = new uint256[](citizens.length);
        for (uint256 i; i < citizens.length; i++) {
            ids[i] = i + 1;
        }
    }
}

contract CryptGovernanceInvariant is Test {
    CryptGovernance internal gov;
    CryptRepublicPassport internal p;
    GovHandler internal handler;
    MockTgt internal tgt;
    address internal admin = makeAddr("admin");
    address internal genesis = makeAddr("genesis");

    uint256 internal constant EXEC_DELAY = 2 days;

    function setUp() public {
        p = new CryptRepublicPassport(admin, "uri/");
        bytes32 gr = p.GENESIS_ATTESTOR_ROLE();
        vm.prank(admin);
        p.grantRole(gr, genesis);
        gov = new CryptGovernance(admin, IPassport(address(p)), 3 days, 2000, EXEC_DELAY, 3);
        tgt = new MockTgt();
        vm.prank(admin);
        gov.setTargetAllowed(address(tgt), true);
        handler = new GovHandler(gov, p, genesis, EXEC_DELAY, address(tgt));
        targetContract(address(handler));
    }

    function invariant_TallyLeCitizens() public view {
        (uint256 f, uint256 a, uint256 ab, uint256 snap) = gov.getVotes(handler.proposalId());
        assertLe(f + a + ab, snap);
    }

    function invariant_NoDoubleVote() public view {
        // Each tokenId's stored vote is set at most once; consistency with the handler mirror.
        uint256[] memory ids = handler.tokenIds();
        uint256 pid = handler.proposalId();
        for (uint256 i; i < ids.length; i++) {
            CryptGovernance.Vote v = gov.voteByPassport(pid, ids[i]);
            bool mirror = handler.votedMirror(pid, ids[i]);
            // if the contract has a vote recorded, the mirror must agree (and vice-versa)
            assertEq(v != CryptGovernance.Vote.None, mirror);
        }
    }

    function invariant_NoExecuteBeforeDelay() public view {
        assertEq(handler.preDelayExecuteSuccess(), 0);
    }
}
