// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptToken} from "../src/CryptToken.sol";

contract CryptTokenHandler is Test {
    CryptToken internal token;
    address internal minter;
    address[] internal actors;
    uint256 internal constant CAP = 1_000_000_000e18;

    constructor(CryptToken _token, address _minter) {
        token = _token;
        minter = _minter;
        actors.push(makeAddr("h1"));
        actors.push(makeAddr("h2"));
        actors.push(makeAddr("h3"));
    }

    function mint(uint256 who, uint256 amount) external {
        address to = actors[who % actors.length];
        amount = bound(amount, 0, CAP - token.totalSupply());
        vm.prank(minter);
        token.mint(to, amount);
    }

    function transfer(uint256 fromIdx, uint256 toIdx, uint256 amount) external {
        address from = actors[fromIdx % actors.length];
        address to = actors[toIdx % actors.length];
        amount = bound(amount, 0, token.balanceOf(from));
        vm.prank(from);
        token.transfer(to, amount);
    }

    function actorsList() external view returns (address[] memory) {
        return actors;
    }
}

contract CryptTokenInvariant is Test {
    CryptToken internal token;
    CryptTokenHandler internal handler;
    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal minter = makeAddr("minter");

    function setUp() public {
        token = new CryptToken(admin, treasury, 0, 1_000_000_000e18);
        bytes32 minterRole = token.MINTER_ROLE();
        vm.prank(admin);
        token.grantRole(minterRole, minter);
        handler = new CryptTokenHandler(token, minter);
        targetContract(address(handler));
    }

    function invariant_TotalSupplyLeCap() public view {
        assertLe(token.totalSupply(), token.MAX_SUPPLY());
    }

    function invariant_BalancesSumToSupply() public view {
        address[] memory a = handler.actorsList();
        uint256 sum = token.balanceOf(treasury);
        for (uint256 i; i < a.length; i++) {
            sum += token.balanceOf(a[i]);
        }
        assertEq(sum, token.totalSupply());
    }
}
