// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {DeployLib} from "./Deploy.s.sol";
import {CryptToken} from "../src/CryptToken.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";
import {CryptGovernance} from "../src/CryptGovernance.sol";
import {CryptTreasury} from "../src/CryptTreasury.sol";
import {DividendDistributor} from "../src/DividendDistributor.sol";
import {CryptStaking} from "../src/CryptStaking.sol";

/// @notice Wires roles + config for an ALREADY-deployed set of contracts. Reads deployed addresses
///         from env vars. Use when deploy + configure are separate txns (e.g. the admin is a Safe).
///         The broadcaster MUST hold DEFAULT_ADMIN_ROLE on each contract and the genesis $CRYPT supply.
contract Configure is Script {
    function run() external {
        address admin = vm.envOr("ADMIN", msg.sender);
        DeployLib.Deployed memory d = DeployLib.Deployed({
            token: CryptToken(vm.envAddress("CRYPT_TOKEN")),
            passport: CryptRepublicPassport(vm.envAddress("PASSPORT")),
            governance: CryptGovernance(payable(vm.envAddress("GOVERNANCE"))),
            treasury: CryptTreasury(payable(vm.envAddress("TREASURY"))),
            distributor: DividendDistributor(vm.envAddress("DISTRIBUTOR")),
            staking: CryptStaking(vm.envAddress("STAKING"))
        });
        vm.startBroadcast();
        DeployLib.configure(d, admin);
        vm.stopBroadcast();
        console2.log("Configured contracts for admin", admin);
    }
}
