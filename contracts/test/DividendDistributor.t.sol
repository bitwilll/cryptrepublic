// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DividendDistributor} from "../src/DividendDistributor.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";
import {IPassport} from "../src/interfaces/IPassport.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {PassportHelper} from "./helpers/PassportHelper.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract DividendDistributorTest is Test {
    using PassportHelper for CryptRepublicPassport;

    DividendDistributor internal dist;
    CryptRepublicPassport internal passport;
    MockERC20 internal crypt;

    address internal admin = makeAddr("admin");
    address internal genesis = makeAddr("genesis");
    address internal funder = makeAddr("funder");

    address[] internal citizens;

    function setUp() public {
        crypt = new MockERC20("CRYPT", "CRYPT");
        passport = new CryptRepublicPassport(admin, "uri/");
        bytes32 gr = passport.GENESIS_ATTESTOR_ROLE();
        vm.prank(admin);
        passport.grantRole(gr, genesis);
        dist = new DividendDistributor(admin, IPassport(address(passport)), IERC20(address(crypt)));
        bytes32 fr = dist.FUNDER_ROLE();
        vm.prank(admin);
        dist.grantRole(fr, funder);
        citizens = passport.mintCitizens(genesis, 4);
    }

    function _openEpoch(uint256 amount) internal returns (uint256 epochId) {
        crypt.mint(funder, amount);
        vm.startPrank(funder);
        crypt.approve(address(dist), amount);
        epochId = dist.openEpoch(amount);
        vm.stopPrank();
    }

    function _tokenIdOf(address who) internal view returns (uint256) {
        for (uint256 i; i < citizens.length; i++) {
            if (citizens[i] == who) return i + 1;
        }
        revert("not a citizen");
    }

    function test_ConstructorRevertsZeroAddress() public {
        vm.expectRevert(DividendDistributor.ZeroAddress.selector);
        new DividendDistributor(address(0), IPassport(address(passport)), IERC20(address(crypt)));
        vm.expectRevert(DividendDistributor.ZeroAddress.selector);
        new DividendDistributor(admin, IPassport(address(0)), IERC20(address(crypt)));
        vm.expectRevert(DividendDistributor.ZeroAddress.selector);
        new DividendDistributor(admin, IPassport(address(passport)), IERC20(address(0)));
    }

    function test_OpenEpochPullsFundsAndSnapshots() public {
        uint256 epochId = _openEpoch(400e18);
        assertEq(epochId, 1);
        assertEq(crypt.balanceOf(address(dist)), 400e18);
        (uint256 amount, uint256 snap, uint256 per,, bool open) = dist.epochs(epochId);
        assertEq(amount, 400e18);
        assertEq(snap, 4);
        assertEq(per, 100e18);
        assertTrue(open);
    }

    function test_OpenEpochOnlyFunder() public {
        crypt.mint(admin, 100e18);
        vm.prank(admin);
        crypt.approve(address(dist), 100e18);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, admin, dist.FUNDER_ROLE()
            )
        );
        vm.prank(admin);
        dist.openEpoch(100e18);
    }

    function test_OpenEpochNoCitizensReverts() public {
        CryptRepublicPassport p2 = new CryptRepublicPassport(admin, "uri/");
        DividendDistributor d2 =
            new DividendDistributor(admin, IPassport(address(p2)), IERC20(address(crypt)));
        bytes32 fr = d2.FUNDER_ROLE();
        vm.prank(admin);
        d2.grantRole(fr, funder);
        crypt.mint(funder, 100e18);
        vm.startPrank(funder);
        crypt.approve(address(d2), 100e18);
        vm.expectRevert(DividendDistributor.NoCitizens.selector);
        d2.openEpoch(100e18);
        vm.stopPrank();
    }

    function test_openEpochRevertsWhenUnderfunded() public {
        crypt.mint(funder, 400e18);
        vm.startPrank(funder);
        crypt.approve(address(dist), 399e18); // approve LESS than requested
        vm.expectRevert(); // SafeERC20 transferFrom failure (insufficient allowance)
        dist.openEpoch(400e18);
        vm.stopPrank();
    }

    function test_ClaimPaysPerCitizen() public {
        _openEpoch(400e18);
        uint256 tid = _tokenIdOf(citizens[0]);
        vm.prank(citizens[0]);
        dist.claim(1, tid);
        assertEq(crypt.balanceOf(citizens[0]), 100e18);
        assertTrue(dist.claimed(1, tid));
    }

    function test_ClaimDoubleReverts() public {
        _openEpoch(400e18);
        uint256 tid = _tokenIdOf(citizens[0]);
        vm.prank(citizens[0]);
        dist.claim(1, tid);
        vm.prank(citizens[0]);
        vm.expectRevert(DividendDistributor.AlreadyClaimed.selector);
        dist.claim(1, tid);
    }

    function test_ClaimNonOwnerReverts() public {
        _openEpoch(400e18);
        uint256 tid = _tokenIdOf(citizens[0]);
        vm.prank(citizens[1]);
        vm.expectRevert(DividendDistributor.NotTokenOwner.selector);
        dist.claim(1, tid);
    }

    function test_ClaimIneligibleTokenReverts() public {
        _openEpoch(400e18);
        // tokenId 5 > snapshot 4
        vm.prank(citizens[0]);
        vm.expectRevert(DividendDistributor.NotEligible.selector);
        dist.claim(1, 5);
    }

    function test_ClaimZeroTokenReverts() public {
        _openEpoch(400e18);
        vm.prank(citizens[0]);
        vm.expectRevert(DividendDistributor.NotEligible.selector);
        dist.claim(1, 0);
    }

    function test_ClaimClosedEpochReverts() public {
        // epoch 2 does not exist -> not open
        vm.prank(citizens[0]);
        vm.expectRevert(DividendDistributor.EpochClosed.selector);
        dist.claim(2, _tokenIdOf(citizens[0]));
    }

    function test_DustStaysInContract() public {
        // 401e18 / 4 = 100.25e18 -> per = 100.25e18, but integer: 401e18/4 = 100250000000000000000
        // Use an amount not divisible: 10 / 4 = 2, dust 2.
        _openEpoch(10);
        (,, uint256 per,,) = dist.epochs(1);
        assertEq(per, 2); // 10/4 = 2
        for (uint256 i; i < 4; i++) {
            vm.prank(citizens[i]);
            dist.claim(1, _tokenIdOf(citizens[i]));
        }
        // 4 * 2 = 8 claimed, 2 dust remains
        assertEq(crypt.balanceOf(address(dist)), 2);
    }

    function test_ClaimMany() public {
        // one owner cannot own multiple tokens (soulbound), so claimMany with one owned token.
        _openEpoch(400e18);
        uint256[] memory ids = new uint256[](1);
        ids[0] = _tokenIdOf(citizens[0]);
        vm.prank(citizens[0]);
        dist.claimMany(1, ids);
        assertEq(crypt.balanceOf(citizens[0]), 100e18);
    }

    function test_Claimable() public {
        _openEpoch(400e18);
        uint256 tid = _tokenIdOf(citizens[0]);
        assertEq(dist.claimable(1, tid), 100e18);
        vm.prank(citizens[0]);
        dist.claim(1, tid);
        assertEq(dist.claimable(1, tid), 0);
        assertEq(dist.claimable(1, 99), 0); // ineligible
        assertEq(dist.claimable(2, tid), 0); // closed epoch
    }

    function testFuzz_claimAmounts(uint8 nCitizens, uint96 amount) public {
        uint256 n = bound(uint256(nCitizens), 1, 50);
        uint256 amt = bound(uint256(amount), n, 1e27); // ensure per >= 1 not required, but avoid 0
        // fresh setup with n citizens
        CryptRepublicPassport p2 = new CryptRepublicPassport(admin, "uri/");
        bytes32 gr = p2.GENESIS_ATTESTOR_ROLE();
        vm.prank(admin);
        p2.grantRole(gr, genesis);
        DividendDistributor d2 =
            new DividendDistributor(admin, IPassport(address(p2)), IERC20(address(crypt)));
        bytes32 fr = d2.FUNDER_ROLE();
        vm.prank(admin);
        d2.grantRole(fr, funder);
        address[] memory cs = p2.mintCitizens(genesis, n);

        crypt.mint(funder, amt);
        vm.startPrank(funder);
        crypt.approve(address(d2), amt);
        d2.openEpoch(amt);
        vm.stopPrank();

        (,, uint256 per,,) = d2.epochs(1);
        uint256 totalClaimed;
        for (uint256 i; i < cs.length; i++) {
            vm.prank(cs[i]);
            d2.claim(1, i + 1);
            totalClaimed += per;
        }
        assertLe(totalClaimed, amt);
        assertEq(per, amt / n);
    }

    function testFuzz_multiEpoch(uint96 a1, uint96 a2) public {
        uint256 amt1 = bound(uint256(a1), 4, 1e27);
        uint256 amt2 = bound(uint256(a2), 4, 1e27);
        _openEpoch(amt1);
        _openEpoch(amt2);
        uint256 tid = _tokenIdOf(citizens[0]);
        vm.prank(citizens[0]);
        dist.claim(1, tid);
        assertTrue(dist.claimed(1, tid));
        assertFalse(dist.claimed(2, tid)); // epoch 2 unaffected
        vm.prank(citizens[0]);
        dist.claim(2, tid);
        assertTrue(dist.claimed(2, tid));
    }
}
