// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptTreasury} from "../src/CryptTreasury.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TreasuryHandler is Test {
    CryptTreasury internal treasury;
    MockERC20 internal token;
    address internal gov;
    address internal nonGov;
    address internal recipient;

    uint256 public inflows;
    uint256 public outflows;
    uint256 public ethIn;
    uint256 public ethOut;
    uint256 public nonGovDisburseSuccess;

    constructor(CryptTreasury _t, MockERC20 _token, address _gov, address _recipient) {
        treasury = _t;
        token = _token;
        gov = _gov;
        recipient = _recipient;
        nonGov = makeAddr("nonGov");
    }

    function fund(uint256 amount) external {
        amount = bound(amount, 0, 1e27);
        token.mint(address(treasury), amount);
        inflows += amount;
    }

    function govDisburse(uint256 amount) external {
        uint256 bal = token.balanceOf(address(treasury));
        amount = bound(amount, 0, bal);
        vm.prank(gov);
        treasury.disburse(address(token), recipient, amount);
        outflows += amount;
    }

    function fundEth(uint256 amount) external {
        amount = bound(amount, 0, 100 ether);
        vm.deal(address(this), amount);
        (bool ok,) = address(treasury).call{value: amount}("");
        require(ok, "eth fund failed");
        ethIn += amount;
    }

    function govDisburseEth(uint256 amount) external {
        uint256 bal = address(treasury).balance;
        amount = bound(amount, 0, bal);
        vm.prank(gov);
        treasury.disburse(address(0), recipient, amount);
        ethOut += amount;
    }

    function tryNonGovDisburse(uint256 amount) external {
        amount = bound(amount, 0, token.balanceOf(address(treasury)));
        vm.prank(nonGov);
        try treasury.disburse(address(token), recipient, amount) {
            nonGovDisburseSuccess++;
        } catch {}
    }

    function tryNonGovDisburseEth(uint256 amount) external {
        amount = bound(amount, 0, address(treasury).balance);
        vm.prank(nonGov);
        try treasury.disburse(address(0), recipient, amount) {
            nonGovDisburseSuccess++;
        } catch {}
    }
}

/// @notice A payable recipient so ETH disbursements succeed.
contract Recipient {
    receive() external payable {}
}

contract CryptTreasuryInvariant is Test {
    CryptTreasury internal treasury;
    MockERC20 internal token;
    TreasuryHandler internal handler;
    Recipient internal recipient;
    address internal admin = makeAddr("admin");
    address internal gov = makeAddr("gov");

    function setUp() public {
        token = new MockERC20("CRYPT", "CRYPT");
        treasury = new CryptTreasury(admin, IERC20(address(token)));
        bytes32 govRole = treasury.GOVERNANCE_ROLE();
        vm.prank(admin);
        treasury.grantRole(govRole, gov);
        recipient = new Recipient();
        handler = new TreasuryHandler(treasury, token, gov, address(recipient));
        targetContract(address(handler));
    }

    function invariant_OutflowsLeInflows() public view {
        assertLe(handler.outflows(), handler.inflows());
        assertEq(token.balanceOf(address(treasury)), handler.inflows() - handler.outflows());
    }

    function invariant_EthConservation() public view {
        assertLe(handler.ethOut(), handler.ethIn());
        assertEq(address(treasury).balance, handler.ethIn() - handler.ethOut());
    }

    function invariant_NonGovCannotReduceBalance() public view {
        assertEq(handler.nonGovDisburseSuccess(), 0);
    }
}
