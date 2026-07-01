// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptGovernance} from "../src/CryptGovernance.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";
import {IPassport} from "../src/interfaces/IPassport.sol";
import {PassportHelper} from "./helpers/PassportHelper.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract MockTarget {
    uint256 public lastValue;
    bool public called;

    function record(uint256 v) external {
        lastValue = v;
        called = true;
    }
}

contract CryptGovernanceTest is Test {
    using PassportHelper for CryptRepublicPassport;

    CryptGovernance internal gov;
    CryptRepublicPassport internal passport;
    MockTarget internal target;

    address internal admin = makeAddr("admin");
    address internal genesis = makeAddr("genesis");

    uint256 internal constant VOTING_PERIOD = 3 days;
    uint16 internal constant QUORUM_BPS = 2000; // 20%
    uint256 internal constant EXEC_DELAY = 2 days;
    uint256 internal constant MIN_CITIZENS = 3;

    address[] internal citizens;

    function setUp() public {
        passport = new CryptRepublicPassport(admin, "uri/");
        bytes32 genesisRole = passport.GENESIS_ATTESTOR_ROLE();
        vm.prank(admin);
        passport.grantRole(genesisRole, genesis);
        gov = new CryptGovernance(
            admin, IPassport(address(passport)), VOTING_PERIOD, QUORUM_BPS, EXEC_DELAY, MIN_CITIZENS
        );
        target = new MockTarget();
        vm.prank(admin);
        gov.setTargetAllowed(address(target), true);
        citizens = passport.mintCitizens(genesis, 5);
    }

    function _payload(uint256 v) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(MockTarget.record.selector, v);
    }

    function _tokenIdOf(address who) internal view returns (uint256) {
        // citizens minted in order 1..n; find index
        for (uint256 i; i < citizens.length; i++) {
            if (citizens[i] == who) return i + 1;
        }
        revert("not a citizen");
    }

    function test_ConstructorRevertsZeroAdmin() public {
        vm.expectRevert(CryptGovernance.ZeroAddress.selector);
        new CryptGovernance(
            address(0),
            IPassport(address(passport)),
            VOTING_PERIOD,
            QUORUM_BPS,
            EXEC_DELAY,
            MIN_CITIZENS
        );
    }

    function test_ConstructorRevertsZeroPassport() public {
        vm.expectRevert(CryptGovernance.ZeroAddress.selector);
        new CryptGovernance(
            admin, IPassport(address(0)), VOTING_PERIOD, QUORUM_BPS, EXEC_DELAY, MIN_CITIZENS
        );
    }

    function test_ConstructorRevertsQuorumTooHigh() public {
        vm.expectRevert(bytes("quorum>100%"));
        new CryptGovernance(
            admin, IPassport(address(passport)), VOTING_PERIOD, 10_001, EXEC_DELAY, MIN_CITIZENS
        );
    }

    function test_ConstructorRevertsMinCitizensZero() public {
        vm.expectRevert(bytes("minCitizens<1"));
        new CryptGovernance(
            admin, IPassport(address(passport)), VOTING_PERIOD, QUORUM_BPS, EXEC_DELAY, 0
        );
    }

    function test_ProposeRequiresCitizen() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(CryptGovernance.NotCitizen.selector);
        gov.propose(address(target), 0, _payload(1), keccak256("d"));
    }

    function test_ProposeRevertsBelowMinCitizens() public {
        // fresh passport with only 1 citizen
        CryptRepublicPassport p2 = new CryptRepublicPassport(admin, "uri/");
        bytes32 gr = p2.GENESIS_ATTESTOR_ROLE();
        vm.prank(admin);
        p2.grantRole(gr, genesis);
        CryptGovernance g2 = new CryptGovernance(
            admin, IPassport(address(p2)), VOTING_PERIOD, QUORUM_BPS, EXEC_DELAY, MIN_CITIZENS
        );
        address solo = makeAddr("solo");
        vm.prank(genesis);
        p2.genesisMint(solo, keccak256("x"), bytes32("m"), bytes32("d"));
        vm.prank(solo);
        vm.expectRevert(CryptGovernance.NotEnoughCitizens.selector);
        g2.propose(address(target), 0, _payload(1), keccak256("d"));
    }

    function test_ProposeCreatesProposal() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(42), keccak256("d"));
        assertEq(id, 1);
        assertEq(uint256(gov.state(id)), uint256(CryptGovernance.State.Active));
    }

    function test_CastVoteRequiresTokenOwner() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(42), keccak256("d"));
        uint256 tid = _tokenIdOf(citizens[1]);
        vm.prank(citizens[0]); // not owner of tid
        vm.expectRevert(CryptGovernance.NotTokenOwner.selector);
        gov.castVote(id, tid, CryptGovernance.Vote.For);
    }

    function test_CastVoteNoDoubleVote() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(42), keccak256("d"));
        uint256 tid = _tokenIdOf(citizens[0]);
        vm.prank(citizens[0]);
        gov.castVote(id, tid, CryptGovernance.Vote.For);
        vm.prank(citizens[0]);
        vm.expectRevert(CryptGovernance.AlreadyVoted.selector);
        gov.castVote(id, tid, CryptGovernance.Vote.Against);
    }

    function test_CastVoteNoneReverts() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(42), keccak256("d"));
        uint256 tid = _tokenIdOf(citizens[0]);
        vm.prank(citizens[0]);
        vm.expectRevert(CryptGovernance.InvalidVote.selector);
        gov.castVote(id, tid, CryptGovernance.Vote.None);
    }

    function test_CastVoteClosedReverts() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(42), keccak256("d"));
        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        uint256 tid = _tokenIdOf(citizens[0]);
        vm.prank(citizens[0]);
        vm.expectRevert(CryptGovernance.VotingClosed.selector);
        gov.castVote(id, tid, CryptGovernance.Vote.For);
    }

    function test_VoteWeightIsOne() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(42), keccak256("d"));
        for (uint256 i; i < 3; i++) {
            vm.prank(citizens[i]);
            gov.castVote(id, _tokenIdOf(citizens[i]), CryptGovernance.Vote.For);
        }
        (uint256 forVotes,,,) = gov.getVotes(id);
        assertEq(forVotes, 3);
    }

    function _passProposal(uint256 v) internal returns (uint256 id) {
        vm.prank(citizens[0]);
        id = gov.propose(address(target), 0, _payload(v), keccak256("d"));
        // 3 of 5 citizens vote For -> quorum 20% met, majority yes
        for (uint256 i; i < 3; i++) {
            vm.prank(citizens[i]);
            gov.castVote(id, _tokenIdOf(citizens[i]), CryptGovernance.Vote.For);
        }
    }

    function test_QueuedThenSucceededTimelock() public {
        uint256 id = _passProposal(7);
        // Move past voting end but not the exec delay.
        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        assertEq(uint256(gov.state(id)), uint256(CryptGovernance.State.Queued));
        // execute reverts before delay
        vm.expectRevert(CryptGovernance.TimelockNotElapsed.selector);
        gov.execute(id);
        // pass the exec delay
        vm.warp(block.timestamp + EXEC_DELAY);
        assertEq(uint256(gov.state(id)), uint256(CryptGovernance.State.Succeeded));
    }

    function test_executeRevertsBeforeDelay() public {
        uint256 id = _passProposal(7);
        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        vm.expectRevert(CryptGovernance.TimelockNotElapsed.selector);
        gov.execute(id);
    }

    function test_ExecuteRunsPayloadOnce() public {
        uint256 id = _passProposal(99);
        vm.warp(block.timestamp + VOTING_PERIOD + EXEC_DELAY + 1);
        gov.execute(id);
        assertTrue(target.called());
        assertEq(target.lastValue(), 99);
        assertEq(uint256(gov.state(id)), uint256(CryptGovernance.State.Executed));
        // re-execute reverts: state() now returns Executed (!= Succeeded), so NotSucceeded fires.
        vm.expectRevert(CryptGovernance.NotSucceeded.selector);
        gov.execute(id);
    }

    function test_ExecuteNonAllowlistedTargetReverts() public {
        MockTarget rogue = new MockTarget();
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(rogue), 0, _payload(1), keccak256("d"));
        for (uint256 i; i < 3; i++) {
            vm.prank(citizens[i]);
            gov.castVote(id, _tokenIdOf(citizens[i]), CryptGovernance.Vote.For);
        }
        vm.warp(block.timestamp + VOTING_PERIOD + EXEC_DELAY + 1);
        vm.expectRevert(CryptGovernance.TargetNotAllowed.selector);
        gov.execute(id);
    }

    function test_ExecuteEmptyPayloadReverts() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, "", keccak256("signal"));
        for (uint256 i; i < 3; i++) {
            vm.prank(citizens[i]);
            gov.castVote(id, _tokenIdOf(citizens[i]), CryptGovernance.Vote.For);
        }
        vm.warp(block.timestamp + VOTING_PERIOD + EXEC_DELAY + 1);
        vm.expectRevert(CryptGovernance.EmptyPayload.selector);
        gov.execute(id);
    }

    function test_DefeatedOnFailedQuorum() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(1), keccak256("d"));
        // only 1 of 5 votes For -> 1*10000 = 10000 vs 5*2000=10000 -> exactly quorum. Make it fail:
        // Actually 1 vote gives (1)*10000 >= 5*2000=10000 -> quorum met. Use 0 votes -> defeated.
        vm.warp(block.timestamp + VOTING_PERIOD + 1);
        assertEq(uint256(gov.state(id)), uint256(CryptGovernance.State.Defeated));
    }

    function test_DefeatedWhenAgainstMajority() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(1), keccak256("d"));
        // 1 For, 2 Against -> quorum met (For+Abstain=1 -> 10000 >= 10000) but againstVotes > forVotes
        vm.prank(citizens[0]);
        gov.castVote(id, _tokenIdOf(citizens[0]), CryptGovernance.Vote.For);
        vm.prank(citizens[1]);
        gov.castVote(id, _tokenIdOf(citizens[1]), CryptGovernance.Vote.Against);
        vm.prank(citizens[2]);
        gov.castVote(id, _tokenIdOf(citizens[2]), CryptGovernance.Vote.Against);
        vm.warp(block.timestamp + VOTING_PERIOD + 1 + EXEC_DELAY);
        assertEq(uint256(gov.state(id)), uint256(CryptGovernance.State.Defeated));
    }

    function test_Cancel() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(1), keccak256("d"));
        vm.prank(citizens[0]);
        gov.cancel(id);
        assertEq(uint256(gov.state(id)), uint256(CryptGovernance.State.Cancelled));
    }

    function test_CancelByAdmin() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(1), keccak256("d"));
        vm.prank(admin);
        gov.cancel(id);
        assertEq(uint256(gov.state(id)), uint256(CryptGovernance.State.Cancelled));
    }

    function test_CancelUnauthorizedReverts() public {
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(1), keccak256("d"));
        vm.prank(citizens[1]);
        vm.expectRevert(CryptGovernance.Unauthorized.selector);
        gov.cancel(id);
    }

    function test_Setters() public {
        vm.startPrank(admin);
        gov.setVotingPeriod(7 days);
        gov.setQuorumBps(5000);
        gov.setExecutionDelay(1 days);
        gov.setMinCitizensForProposal(5);
        vm.stopPrank();
        assertEq(gov.votingPeriod(), 7 days);
        assertEq(gov.quorumBps(), 5000);
        assertEq(gov.executionDelay(), 1 days);
        assertEq(gov.minCitizensForProposal(), 5);
    }

    function test_SetterOnlyAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, citizens[0], bytes32(0)
            )
        );
        vm.prank(citizens[0]);
        gov.setVotingPeriod(1 days);
    }

    function test_SetQuorumTooHighReverts() public {
        vm.prank(admin);
        vm.expectRevert(bytes("quorum>100%"));
        gov.setQuorumBps(10_001);
    }

    function test_SetMinCitizensZeroReverts() public {
        vm.prank(admin);
        vm.expectRevert(bytes("minCitizens<1"));
        gov.setMinCitizensForProposal(0);
    }

    function testFuzz_voteWeightAlwaysOne(uint8 nFor) public {
        uint256 n = citizens.length;
        uint256 f = bound(uint256(nFor), 0, n);
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(1), keccak256("d"));
        for (uint256 i; i < f; i++) {
            vm.prank(citizens[i]);
            gov.castVote(id, _tokenIdOf(citizens[i]), CryptGovernance.Vote.For);
        }
        (uint256 forVotes, uint256 against, uint256 abstain, uint256 snap) = gov.getVotes(id);
        assertEq(forVotes, f);
        assertLe(forVotes + against + abstain, snap);
    }

    function testFuzz_noDoubleVote(uint8 idx) public {
        uint256 i = bound(uint256(idx), 0, citizens.length - 1);
        vm.prank(citizens[0]);
        uint256 id = gov.propose(address(target), 0, _payload(1), keccak256("d"));
        uint256 tid = _tokenIdOf(citizens[i]);
        vm.prank(citizens[i]);
        gov.castVote(id, tid, CryptGovernance.Vote.For);
        (uint256 forBefore,,,) = gov.getVotes(id);
        vm.prank(citizens[i]);
        vm.expectRevert(CryptGovernance.AlreadyVoted.selector);
        gov.castVote(id, tid, CryptGovernance.Vote.Against);
        (uint256 forAfter,,,) = gov.getVotes(id);
        assertEq(forBefore, forAfter);
    }
}
