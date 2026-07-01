// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptStaking} from "../src/CryptStaking.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StakingHandler is Test {
    CryptStaking internal staking;
    MockERC20 internal crypt;
    address internal rewards;
    address[] internal actors;

    uint256 public totalFunded;
    uint256 public totalClaimed;

    constructor(CryptStaking _staking, MockERC20 _crypt, address _rewards) {
        staking = _staking;
        crypt = _crypt;
        rewards = _rewards;
        for (uint256 i; i < 4; i++) {
            address a = makeAddr(string.concat("sa", vm.toString(i)));
            actors.push(a);
            crypt.mint(a, 1_000_000e18);
        }
    }

    function stake(uint256 who, uint256 amount) external {
        address a = actors[who % actors.length];
        amount = bound(amount, 1, crypt.balanceOf(a));
        vm.startPrank(a);
        crypt.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    function unstake(uint256 who, uint256 amount) external {
        address a = actors[who % actors.length];
        (uint256 staked,,) = staking.stakes(a);
        if (staked == 0) return;
        amount = bound(amount, 1, staked);
        vm.prank(a);
        staking.unstake(amount);
    }

    function claim(uint256 who) external {
        address a = actors[who % actors.length];
        uint256 before = crypt.balanceOf(a);
        vm.prank(a);
        staking.claim();
        totalClaimed += crypt.balanceOf(a) - before;
    }

    function fund(uint256 amount) external {
        amount = bound(amount, 0, crypt.balanceOf(rewards));
        vm.startPrank(rewards);
        crypt.approve(address(staking), amount);
        staking.fundRewards(amount);
        vm.stopPrank();
        totalFunded += amount;
    }

    function setApr(uint16 bps) external {
        uint16 apr = uint16(bound(uint256(bps), 0, 50_000));
        vm.prank(rewards);
        staking.setApr(apr);
    }

    function warp(uint256 dt) external {
        dt = bound(dt, 0, 60 days);
        vm.warp(block.timestamp + dt);
    }

    function sumStakes() external view returns (uint256 total) {
        for (uint256 i; i < actors.length; i++) {
            (uint256 amt,,) = staking.stakes(actors[i]);
            total += amt;
        }
    }
}

contract CryptStakingInvariant is Test {
    CryptStaking internal staking;
    MockERC20 internal crypt;
    StakingHandler internal handler;
    address internal admin = makeAddr("admin");
    address internal rewards = makeAddr("rewards");

    function setUp() public {
        crypt = new MockERC20("CRYPT", "CRYPT");
        staking = new CryptStaking(admin, IERC20(address(crypt)), 1000);
        bytes32 rr = staking.REWARDS_ADMIN_ROLE();
        vm.prank(admin);
        staking.grantRole(rr, rewards);
        crypt.mint(rewards, 100_000_000e18);
        handler = new StakingHandler(staking, crypt, rewards);
        // grant the handler-controlled rewards role holder already set; handler pranks as `rewards`.
        targetContract(address(handler));
    }

    function invariant_TotalStakedEqualsSum() public view {
        assertEq(staking.totalStaked(), handler.sumStakes());
    }

    function invariant_PrincipalCovered() public view {
        assertGe(crypt.balanceOf(address(staking)), staking.totalStaked());
    }

    function invariant_ClaimedLeReserve() public view {
        assertLe(handler.totalClaimed(), handler.totalFunded());
    }

    function invariant_OwedRewardsBackedByFunding() public view {
        // Conservation: everything funded is either still in the reserve or already claimed.
        assertEq(handler.totalClaimed() + staking.rewardPoolRemaining(), handler.totalFunded());
        // The reserve is fully token-backed and never eats principal.
        assertGe(
            crypt.balanceOf(address(staking)), staking.totalStaked() + staking.rewardPoolRemaining()
        );
    }
}
