// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {CryptRepublicPassport} from "../../src/CryptRepublicPassport.sol";

library PassportHelper {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function mintCitizens(CryptRepublicPassport p, address genesis, uint256 n)
        internal
        returns (address[] memory who)
    {
        who = new address[](n);
        for (uint256 i; i < n; i++) {
            who[i] = vm.addr(uint256(keccak256(abi.encode("citizen", i))));
            vm.prank(genesis);
            p.genesisMint(who[i], keccak256(abi.encode(who[i])), bytes32("m"), bytes32("d"));
        }
    }
}
