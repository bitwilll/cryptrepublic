// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptStaking} from "../src/CryptStaking.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract CryptStakingTest is Test {
    CryptStaking internal staking;
    MockERC20 internal crypt;

    address internal admin = makeAddr("admin");
    address internal rewards = makeAddr("rewards");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant YEAR = 365 days;
    uint16 internal constant APR = 1000; // 10%

    function setUp() public {
        crypt = new MockERC20("CRYPT", "CRYPT");
        staking = new CryptStaking(admin, IERC20(address(crypt)), APR);
        bytes32 rr = staking.REWARDS_ADMIN_ROLE();
        vm.prank(admin);
        staking.grantRole(rr, rewards);
        crypt.mint(alice, 1_000e18);
        crypt.mint(bob, 1_000e18);
        crypt.mint(rewards, 1_000_000e18);
    }

    function _stake(address who, uint256 amount) internal {
        vm.startPrank(who);
        crypt.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    function _fund(uint256 amount) internal {
        vm.startPrank(rewards);
        crypt.approve(address(staking), amount);
        staking.fundRewards(amount);
        vm.stopPrank();
    }

    function test_ConstructorRevertsZeroAddress() public {
        vm.expectRevert(CryptStaking.ZeroAddress.selector);
        new CryptStaking(address(0), IERC20(address(crypt)), APR);
        vm.expectRevert(CryptStaking.ZeroAddress.selector);
        new CryptStaking(admin, IERC20(address(0)), APR);
    }

    function test_ConstructorRevertsAprTooHigh() public {
        vm.expectRevert(bytes("apr>500%"));
        new CryptStaking(admin, IERC20(address(crypt)), 50_001);
    }

    function test_StakePullsTokens() public {
        _stake(alice, 100e18);
        assertEq(staking.totalStaked(), 100e18);
        (uint256 amount,,) = staking.stakes(alice);
        assertEq(amount, 100e18);
        assertEq(crypt.balanceOf(address(staking)), 100e18);
    }

    function test_StakeZeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(CryptStaking.ZeroAmount.selector);
        staking.stake(0);
    }

    function test_EarnedAfterYear() public {
        _stake(alice, 100e18);
        vm.warp(block.timestamp + YEAR);
        assertEq(staking.earned(alice), 10e18); // 10% of 100
    }

    function test_ClaimPaysAccrued() public {
        _stake(alice, 100e18);
        _fund(100e18);
        vm.warp(block.timestamp + YEAR);
        uint256 balBefore = crypt.balanceOf(alice);
        vm.prank(alice);
        staking.claim();
        assertEq(crypt.balanceOf(alice) - balBefore, 10e18);
    }

    function test_ClaimCappedAtRewardPool() public {
        _stake(alice, 100e18);
        _fund(4e18); // only 4 funded, but 10 accrued
        vm.warp(block.timestamp + YEAR);
        uint256 balBefore = crypt.balanceOf(alice);
        vm.prank(alice);
        staking.claim();
        assertEq(crypt.balanceOf(alice) - balBefore, 4e18); // capped
        assertEq(staking.rewardPoolRemaining(), 0);
    }

    function test_ClaimZeroNoop() public {
        _stake(alice, 100e18);
        // no time passed, no rewards
        vm.prank(alice);
        staking.claim(); // should not revert, pays 0
        assertEq(crypt.balanceOf(alice), 900e18); // unchanged (staked 100 of 1000)
    }

    function test_Unstake() public {
        _stake(alice, 100e18);
        _fund(100e18);
        vm.warp(block.timestamp + YEAR);
        vm.prank(alice);
        staking.unstake(100e18);
        (uint256 amount,,) = staking.stakes(alice);
        assertEq(amount, 0);
        assertEq(staking.totalStaked(), 0);
        // rewards settled but not auto-paid; earned still available
        assertEq(staking.earned(alice), 10e18);
    }

    function test_UnstakeZeroReverts() public {
        _stake(alice, 100e18);
        vm.prank(alice);
        vm.expectRevert(CryptStaking.ZeroAmount.selector);
        staking.unstake(0);
    }

    function test_UnstakeTooMuchReverts() public {
        _stake(alice, 100e18);
        vm.prank(alice);
        vm.expectRevert(CryptStaking.InsufficientStake.selector);
        staking.unstake(101e18);
    }

    function test_FundRewardsOnlyAdmin() public {
        vm.prank(alice);
        crypt.approve(address(staking), 1e18);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                staking.REWARDS_ADMIN_ROLE()
            )
        );
        vm.prank(alice);
        staking.fundRewards(1e18);
    }

    function test_SetAprOnlyAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                staking.REWARDS_ADMIN_ROLE()
            )
        );
        vm.prank(alice);
        staking.setApr(2000);
    }

    function test_SetAprTooHighReverts() public {
        vm.prank(rewards);
        vm.expectRevert(bytes("apr>500%"));
        staking.setApr(50_001);
    }

    /// The critical prospective-APR test (Synthetix accumulator).
    function test_setAprProspective() public {
        _stake(alice, 100e18);
        // half a year at 10%
        vm.warp(block.timestamp + YEAR / 2);
        vm.prank(rewards);
        staking.setApr(2000); // 20%
        // another half year at 20%
        vm.warp(block.timestamp + YEAR / 2);
        // 0.5*10%*100 + 0.5*20%*100 = 5 + 10 = 15
        assertEq(staking.earned(alice), 15e18);
    }

    function test_RewardPerTokenGrows() public {
        _stake(alice, 100e18);
        uint256 before = staking.rewardPerToken();
        vm.warp(block.timestamp + YEAR);
        assertGt(staking.rewardPerToken(), before);
    }

    function testFuzz_stakeUnstakeRoundtrip(uint96 amount) public {
        uint256 amt = bound(uint256(amount), 1, 1_000e18);
        _stake(alice, amt);
        vm.prank(alice);
        staking.unstake(amt);
        (uint256 staked,,) = staking.stakes(alice);
        assertEq(staked, 0);
        assertEq(staking.totalStaked(), 0);
        assertEq(crypt.balanceOf(alice), 1_000e18); // principal fully returned
    }

    function testFuzz_rewardAccrual(uint96 amount, uint32 elapsed) public {
        uint256 amt = bound(uint256(amount), 1e18, 1_000e18);
        _stake(alice, amt);
        vm.warp(block.timestamp + elapsed);
        uint256 expected = (amt * APR * uint256(elapsed)) / (YEAR * 10_000);
        assertApproxEqAbs(staking.earned(alice), expected, amt / 1e18 + 1);
    }

    function testFuzz_setAprProspective(uint16 apr1, uint16 apr2, uint32 t1, uint32 t2) public {
        uint256 a1 = bound(uint256(apr1), 0, 50_000);
        uint256 a2 = bound(uint256(apr2), 0, 50_000);
        uint256 w1 = bound(uint256(t1), 0, 3 * YEAR);
        uint256 w2 = bound(uint256(t2), 0, 3 * YEAR);
        CryptStaking s = new CryptStaking(admin, IERC20(address(crypt)), uint16(a1));
        bytes32 rr = s.REWARDS_ADMIN_ROLE();
        vm.prank(admin);
        s.grantRole(rr, rewards);
        uint256 amt = 100e18;
        vm.startPrank(alice);
        crypt.approve(address(s), amt);
        s.stake(amt);
        vm.stopPrank();
        vm.warp(block.timestamp + w1);
        vm.prank(rewards);
        s.setApr(uint16(a2));
        vm.warp(block.timestamp + w2);
        uint256 expected = (amt * a1 * w1) / (YEAR * 10_000) + (amt * a2 * w2) / (YEAR * 10_000);
        // The accumulator truncates at PRECISION scale on each checkpoint (stake, setApr, earned),
        // so per-window rounding error is bounded by ~amt/PRECISION per checkpoint. Use 3x + slack.
        assertApproxEqAbs(s.earned(alice), expected, 3 * (amt / 1e18) + 3);
    }
}
