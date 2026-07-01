// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";

/// @notice Genesis-mints seed citizens. The broadcaster MUST hold GENESIS_ATTESTOR_ROLE on the
///         passport. AFTER seeding, revoke GENESIS_ATTESTOR_ROLE (see DEPLOY_RUNBOOK.md) so no more
///         zero-witness bootstrap mints are possible.
contract SeedGenesis is Script {
    function run() external {
        CryptRepublicPassport passport = CryptRepublicPassport(vm.envAddress("PASSPORT"));
        // Comma-separated list of seed citizen addresses in SEED_CITIZENS.
        address[] memory seeds = vm.envAddress("SEED_CITIZENS", ",");
        vm.startBroadcast();
        for (uint256 i; i < seeds.length; i++) {
            uint256 tokenId = passport.genesisMint(
                seeds[i], keccak256(abi.encode(seeds[i])), bytes32("Founder"), bytes32("Genesis")
            );
            console2.log("Genesis-minted citizen", tokenId, seeds[i]);
        }
        vm.stopBroadcast();
        console2.log("Seeded", seeds.length, "citizens. REMEMBER to revoke GENESIS_ATTESTOR_ROLE.");
    }
}
