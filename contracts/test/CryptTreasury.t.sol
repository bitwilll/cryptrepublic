// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptTreasury} from "../src/CryptTreasury.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/// @notice A pull-based epoch opener mimicking DividendDistributor's openEpoch (Task 7 tests the real one).
contract MockDistributor {
    IERC20 public immutable crypt;
    uint256 public epochCount;
    uint256 public lastAmount;

    constructor(IERC20 crypt_) {
        crypt = crypt_;
    }

    function openEpoch(uint256 amount) external returns (uint256 epochId) {
        crypt.transferFrom(msg.sender, address(this), amount); // PULL
        lastAmount = amount;
        epochId = ++epochCount;
    }
}

contract RejectEth {
// no receive/fallback -> rejects ETH
}

contract PayableSink {
    receive() external payable {}
}

contract CryptTreasuryTest is Test {
    CryptTreasury internal treasury;
    MockERC20 internal crypt;
    MockERC20 internal other;

    address internal admin = makeAddr("admin");
    address internal gov = makeAddr("gov");
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        crypt = new MockERC20("CryptRepublic Token", "CRYPT");
        other = new MockERC20("Other", "OTH");
        treasury = new CryptTreasury(admin, IERC20(address(crypt)));
        bytes32 govRole = treasury.GOVERNANCE_ROLE();
        vm.prank(admin);
        treasury.grantRole(govRole, gov);
    }

    function test_ConstructorRevertsZeroAdmin() public {
        vm.expectRevert(CryptTreasury.ZeroAddress.selector);
        new CryptTreasury(address(0), IERC20(address(crypt)));
    }

    function test_ConstructorRevertsZeroCrypt() public {
        vm.expectRevert(CryptTreasury.ZeroAddress.selector);
        new CryptTreasury(admin, IERC20(address(0)));
    }

    function test_OnlyGovernanceCanDisburse() public {
        other.mint(address(treasury), 100e18);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                recipient,
                treasury.GOVERNANCE_ROLE()
            )
        );
        vm.prank(recipient);
        treasury.disburse(address(other), recipient, 1e18);
    }

    function test_DisburseErc20() public {
        other.mint(address(treasury), 100e18);
        vm.prank(gov);
        treasury.disburse(address(other), recipient, 40e18);
        assertEq(other.balanceOf(recipient), 40e18);
        assertEq(other.balanceOf(address(treasury)), 60e18);
        assertEq(treasury.balanceOf(address(other)), 60e18);
    }

    function test_DisburseZeroRecipientReverts() public {
        other.mint(address(treasury), 100e18);
        vm.prank(gov);
        vm.expectRevert(CryptTreasury.ZeroAddress.selector);
        treasury.disburse(address(other), address(0), 1e18);
    }

    function test_DisburseEth() public {
        vm.deal(address(treasury), 10 ether);
        PayableSink sink = new PayableSink();
        vm.prank(gov);
        treasury.disburse(address(0), address(sink), 3 ether);
        assertEq(address(sink).balance, 3 ether);
        assertEq(treasury.balanceOf(address(0)), 7 ether);
    }

    function test_DisburseEthToRejecterReverts() public {
        vm.deal(address(treasury), 10 ether);
        RejectEth r = new RejectEth();
        vm.prank(gov);
        vm.expectRevert(CryptTreasury.EthTransferFailed.selector);
        treasury.disburse(address(0), address(r), 1 ether);
    }

    function test_ReceiveEth() public {
        (bool ok,) = address(treasury).call{value: 5 ether}("");
        assertTrue(ok);
        assertEq(address(treasury).balance, 5 ether);
    }

    function test_SetAllocation() public {
        vm.startPrank(admin);
        treasury.setAllocation(bytes32("dividends"), 4000);
        treasury.setAllocation(bytes32("staking"), 3000);
        vm.stopPrank();
        assertEq(treasury.allocationBps(bytes32("dividends")), 4000);
        assertEq(treasury.totalAllocationBps(), 7000);
    }

    function test_SetAllocationOverflowReverts() public {
        vm.startPrank(admin);
        treasury.setAllocation(bytes32("a"), 6000);
        vm.expectRevert(CryptTreasury.AllocationOverflow.selector);
        treasury.setAllocation(bytes32("b"), 5000); // 6000+5000 > 10000
        vm.stopPrank();
    }

    function test_SetAllocationCanUpdateExisting() public {
        vm.startPrank(admin);
        treasury.setAllocation(bytes32("a"), 6000);
        treasury.setAllocation(bytes32("a"), 3000); // updates: total 6000 - 6000 + 3000 = 3000
        vm.stopPrank();
        assertEq(treasury.totalAllocationBps(), 3000);
    }

    function test_SetAssetWhitelist() public {
        vm.prank(admin);
        treasury.setAssetWhitelist(address(other), true);
        assertTrue(treasury.assetWhitelist(address(other)));
    }

    function test_fundDividendsAtomicOpensEpoch() public {
        MockDistributor dist = new MockDistributor(IERC20(address(crypt)));
        crypt.mint(address(treasury), 1000e18);
        vm.prank(gov);
        uint256 epochId = treasury.fundDividends(address(dist), 600e18);
        assertEq(epochId, 1);
        assertEq(crypt.balanceOf(address(dist)), 600e18); // pulled atomically
        assertEq(crypt.balanceOf(address(treasury)), 400e18);
        assertEq(crypt.allowance(address(treasury), address(dist)), 0); // residual cleared
    }

    function test_fundDividendsOnlyGovernance() public {
        MockDistributor dist = new MockDistributor(IERC20(address(crypt)));
        crypt.mint(address(treasury), 1000e18);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                recipient,
                treasury.GOVERNANCE_ROLE()
            )
        );
        vm.prank(recipient);
        treasury.fundDividends(address(dist), 100e18);
    }

    function test_fundDividendsZeroDistributorReverts() public {
        crypt.mint(address(treasury), 1000e18);
        vm.prank(gov);
        vm.expectRevert(CryptTreasury.ZeroAddress.selector);
        treasury.fundDividends(address(0), 100e18);
    }

    function test_ReentrancyBlocked() public {
        ReentrantToken re = new ReentrantToken();
        CryptTreasury t2 = new CryptTreasury(admin, IERC20(address(re)));
        bytes32 govRole = t2.GOVERNANCE_ROLE();
        vm.prank(admin);
        t2.grantRole(govRole, gov);
        re.mint(address(t2), 100e18);
        // Arm the token to re-enter disburse during transfer.
        re.arm(
            address(t2), abi.encodeWithSelector(t2.disburse.selector, address(re), recipient, 1e18)
        );
        vm.prank(gov);
        vm.expectRevert(); // reentry -> ReentrancyGuardReentrantCall bubbled up
        t2.disburse(address(re), recipient, 1e18);
    }

    function testFuzz_disburseWithinBalance(uint256 fund, uint256 amount) public {
        fund = bound(fund, 0, 1e30);
        amount = bound(amount, 0, fund);
        other.mint(address(treasury), fund);
        uint256 balBefore = other.balanceOf(address(treasury));
        vm.prank(gov);
        treasury.disburse(address(other), recipient, amount);
        assertEq(other.balanceOf(address(treasury)), balBefore - amount);
        assertEq(other.balanceOf(recipient), amount);
    }
}
