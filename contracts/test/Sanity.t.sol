// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract SanityTest is Test {
    function test_OZRemappingResolves() public pure {
        // Proves the OZ v5 remapping compiles and links.
        assertEq(Strings.toString(uint256(42)), "42");
    }
}
