// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptToken} from "../src/CryptToken.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract CryptTokenTest is Test {
    CryptToken internal token;
    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");
    address internal alice = makeAddr("alice");

    uint256 internal constant INITIAL = 100_000_000e18;
    uint256 internal constant CAP = 1_000_000_000e18;

    function setUp() public {
        token = new CryptToken(admin, treasury, INITIAL, CAP);
        bytes32 minterRole = token.MINTER_ROLE();
        vm.prank(admin);
        token.grantRole(minterRole, minter);
    }

    function test_Metadata() public view {
        assertEq(token.name(), "CryptRepublic Token");
        assertEq(token.symbol(), "CRYPT");
        assertEq(token.decimals(), 18);
        assertEq(token.MAX_SUPPLY(), CAP);
    }

    function test_InitialSupplyToTreasury() public view {
        assertEq(token.totalSupply(), INITIAL);
        assertEq(token.balanceOf(treasury), INITIAL);
    }

    function test_AdminHasDefaultAdminRole() public view {
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_ConstructorRevertsZeroAdmin() public {
        vm.expectRevert(CryptToken.ZeroAddress.selector);
        new CryptToken(address(0), treasury, INITIAL, CAP);
    }

    function test_ConstructorRevertsZeroTreasury() public {
        vm.expectRevert(CryptToken.ZeroAddress.selector);
        new CryptToken(admin, address(0), INITIAL, CAP);
    }

    function test_ConstructorRevertsInitialAboveCap() public {
        vm.expectRevert(CryptToken.CapExceeded.selector);
        new CryptToken(admin, treasury, CAP + 1, CAP);
    }

    function test_ConstructorZeroInitialSupplyMintsNothing() public {
        CryptToken t = new CryptToken(admin, treasury, 0, CAP);
        assertEq(t.totalSupply(), 0);
        assertEq(t.balanceOf(treasury), 0);
    }

    function test_MinterCanMintWithinCap() public {
        vm.prank(minter);
        token.mint(alice, 1e18);
        assertEq(token.balanceOf(alice), 1e18);
    }

    function test_NonMinterCannotMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, token.MINTER_ROLE()
            )
        );
        vm.prank(alice);
        token.mint(alice, 1e18);
    }

    function test_MintRevertsOverCap() public {
        vm.prank(minter);
        vm.expectRevert(CryptToken.CapExceeded.selector);
        token.mint(alice, CAP); // INITIAL already minted, so CAP more exceeds
    }

    function test_MintUpToExactCapSucceeds() public {
        vm.prank(minter);
        token.mint(alice, CAP - INITIAL);
        assertEq(token.totalSupply(), CAP);
    }

    function test_PauseBlocksTransfer() public {
        vm.startPrank(admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        token.pause();
        vm.stopPrank();
        vm.prank(treasury);
        vm.expectRevert(); // ERC20Pausable EnforcedPause
        token.transfer(alice, 1e18);
    }

    function test_UnpauseRestoresTransfer() public {
        vm.startPrank(admin);
        token.grantRole(token.PAUSER_ROLE(), admin);
        token.pause();
        token.unpause();
        vm.stopPrank();
        vm.prank(treasury);
        token.transfer(alice, 1e18);
        assertEq(token.balanceOf(alice), 1e18);
    }

    function test_NonPauserCannotPause() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, token.PAUSER_ROLE()
            )
        );
        vm.prank(alice);
        token.pause();
    }

    function test_Permit() public {
        (address owner, uint256 pk) = makeAddrAndKey("permitOwner");
        vm.prank(treasury);
        token.transfer(owner, 10e18);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                owner,
                alice,
                5e18,
                token.nonces(owner),
                deadline
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        token.permit(owner, alice, 5e18, deadline, v, r, s);
        assertEq(token.allowance(owner, alice), 5e18);
    }

    function testFuzz_MintNeverExceedsCap(uint256 amount) public {
        amount = bound(amount, 0, CAP - INITIAL);
        vm.prank(minter);
        token.mint(alice, amount);
        assertLe(token.totalSupply(), CAP);
    }

    function testFuzz_TransferConservesSupply(uint96 amount) public {
        uint256 amt = bound(uint256(amount), 0, INITIAL);
        uint256 supplyBefore = token.totalSupply();
        vm.prank(treasury);
        token.transfer(alice, amt);
        assertEq(token.totalSupply(), supplyBefore);
        assertEq(token.balanceOf(treasury) + token.balanceOf(alice), INITIAL);
    }
}
