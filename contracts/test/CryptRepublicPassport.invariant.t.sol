// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";

contract PassportHandler is Test {
    CryptRepublicPassport internal p;
    address internal genesis;
    address internal admin;
    address[] internal actors;
    uint256 public transferSuccessCount;
    uint256 public minted;
    uint256 public burned;
    // tokenId held by each actor (0 == none); lets the burn action target the caller's own token.
    mapping(address => uint256) public tokenOf;

    constructor(CryptRepublicPassport _p, address _genesis, address _admin) {
        p = _p;
        genesis = _genesis;
        admin = _admin;
        for (uint256 i; i < 5; i++) {
            actors.push(makeAddr(string.concat("a", vm.toString(i))));
        }
    }

    function mint(uint256 who) external {
        address to = actors[who % actors.length];
        if (p.hasPassport(to)) return;
        vm.prank(genesis);
        uint256 id = p.genesisMint(to, keccak256(abi.encode(to)), bytes32("m"), bytes32("d"));
        tokenOf[to] = id;
        minted++;
    }

    // Exercises the OVERRIDDEN public burn: must run the burnEnabled gate AND clear hasPassport.
    function burn(uint256 who) external {
        address holder = actors[who % actors.length];
        uint256 id = tokenOf[holder];
        if (id == 0 || !p.hasPassport(holder)) return;
        vm.prank(admin);
        p.setBurnEnabled(true);
        vm.prank(holder);
        p.burn(id); // routes through the same policy as renounce
        tokenOf[holder] = 0;
        burned++;
    }

    function tryTransfer(uint256 fromIdx, uint256 toIdx, uint256 tokenId) external {
        address from = actors[fromIdx % actors.length];
        address to = actors[toIdx % actors.length];
        tokenId = bound(tokenId, 1, minted == 0 ? 1 : minted);
        vm.prank(from);
        try p.transferFrom(from, to, tokenId) {
            transferSuccessCount++; // MUST never happen (soulbound)
        } catch {}
    }

    function actorsList() external view returns (address[] memory) {
        return actors;
    }
}

contract CryptRepublicPassportInvariant is Test {
    CryptRepublicPassport internal p;
    PassportHandler internal handler;
    address internal admin = makeAddr("admin");
    address internal genesis = makeAddr("genesis");

    function setUp() public {
        p = new CryptRepublicPassport(admin, "uri/");
        vm.startPrank(admin);
        p.grantRole(p.GENESIS_ATTESTOR_ROLE(), genesis);
        p.grantRole(p.PASSPORT_ADMIN_ROLE(), admin); // handler toggles burnEnabled via admin
        vm.stopPrank();
        handler = new PassportHandler(p, genesis, admin);
        targetContract(address(handler));
    }

    function invariant_NoTransfersEver() public view {
        assertEq(handler.transferSuccessCount(), 0);
    }

    function invariant_BalanceAtMostOne() public view {
        address[] memory a = handler.actorsList();
        for (uint256 i; i < a.length; i++) {
            assertLe(p.balanceOf(a[i]), 1);
        }
    }

    /// The citizen flag must NEVER desync from the token — a stale `hasPassport==true`
    /// after a burn would brick the address (isCitizen true, no token).
    function invariant_HasPassportMatchesBalance() public view {
        address[] memory a = handler.actorsList();
        for (uint256 i; i < a.length; i++) {
            assertEq(p.hasPassport(a[i]), p.balanceOf(a[i]) == 1);
        }
    }

    function invariant_TotalSupplyEqualsCitizens() public view {
        // totalCitizens() is a MONOTONIC counter (does not decrement on burn); live == minted - burned.
        assertEq(p.totalCitizens(), handler.minted());
        assertEq(handler.minted() - handler.burned(), _liveHolders());
    }

    function _liveHolders() internal view returns (uint256 n) {
        address[] memory a = handler.actorsList();
        for (uint256 i; i < a.length; i++) {
            if (p.balanceOf(a[i]) == 1) n++;
        }
    }
}
