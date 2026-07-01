// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {CryptToken} from "../src/CryptToken.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";
import {CryptGovernance} from "../src/CryptGovernance.sol";
import {CryptTreasury} from "../src/CryptTreasury.sol";
import {DividendDistributor} from "../src/DividendDistributor.sol";
import {CryptStaking} from "../src/CryptStaking.sol";
import {IPassport} from "../src/interfaces/IPassport.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library DeployLib {
    uint256 internal constant INITIAL_SUPPLY = 100_000_000e18;
    uint256 internal constant MAX_SUPPLY = 1_000_000_000e18;

    struct Deployed {
        CryptToken token;
        CryptRepublicPassport passport;
        CryptGovernance governance;
        CryptTreasury treasury;
        DividendDistributor distributor;
        CryptStaking staking;
    }

    function deployAll(address admin) internal returns (Deployed memory d) {
        // Token and Treasury are mutually referential (Token mints initial supply to a holder; Treasury
        // holds the `crypt` immutable). Break the cycle: mint the initial supply to `admin`, then deploy
        // the Treasury with the token, then `configure` moves the supply admin -> treasury.
        d.token = new CryptToken(admin, admin, INITIAL_SUPPLY, MAX_SUPPLY);
        d.treasury = new CryptTreasury(admin, IERC20(address(d.token)));
        d.passport = new CryptRepublicPassport(admin, "https://api.cryptrepublic.example/passport/");
        // args: admin, passport, votingPeriod, quorumBps, executionDelay (fix #6), minCitizens (fix #10)
        d.governance =
            new CryptGovernance(admin, IPassport(address(d.passport)), 3 days, 2000, 2 days, 3);
        d.distributor =
            new DividendDistributor(admin, IPassport(address(d.passport)), IERC20(address(d.token)));
        d.staking = new CryptStaking(admin, IERC20(address(d.token)), 1180); // ~11.8% APR (mockup)
    }

    function configure(Deployed memory d, address admin) internal {
        // Caller must hold DEFAULT_ADMIN_ROLE on each contract (the `admin` used at deploy) AND the
        // initial $CRYPT supply (minted to `admin` in deployAll).
        d.token.transfer(address(d.treasury), d.token.balanceOf(admin)); // move genesis supply to treasury
        d.token.grantRole(d.token.MINTER_ROLE(), address(d.distributor));
        d.token.grantRole(d.token.MINTER_ROLE(), address(d.staking));
        d.token.grantRole(d.token.PAUSER_ROLE(), admin);
        d.treasury.grantRole(d.treasury.GOVERNANCE_ROLE(), address(d.governance));
        d.distributor.grantRole(d.distributor.FUNDER_ROLE(), address(d.treasury));
        d.distributor.grantRole(d.distributor.FUNDER_ROLE(), admin);
        d.staking.grantRole(d.staking.REWARDS_ADMIN_ROLE(), admin);
        d.passport.grantRole(d.passport.PASSPORT_ADMIN_ROLE(), admin);
        d.passport.grantRole(d.passport.GENESIS_ATTESTOR_ROLE(), admin);
        d.passport.setRequiredWitnesses(7); // spec: "7 Witnesses"
        d.governance.setTargetAllowed(address(d.treasury), true);
        // Major fix #6 + #10: governance execution timelock + min-citizens quorum floor are set at
        // construction; no extra wiring needed here beyond allowlisting the treasury target. On a live
        // net, admin roles then move to the Safe + TimelockController per DEPLOY_RUNBOOK.md.
    }
}

contract Deploy is Script {
    function run() external returns (DeployLib.Deployed memory d) {
        address admin = vm.envOr("ADMIN", msg.sender);
        vm.startBroadcast();
        d = DeployLib.deployAll(admin);
        // Configure only if the broadcaster IS the admin (holds the roles + genesis supply);
        // otherwise Configure.s.sol runs later as the admin/Safe.
        if (admin == msg.sender) DeployLib.configure(d, admin);
        vm.stopBroadcast();
        _log(d);
    }

    function _log(DeployLib.Deployed memory d) internal pure {
        console2.log("CryptToken", address(d.token));
        console2.log("Passport", address(d.passport));
        console2.log("Governance", address(d.governance));
        console2.log("Treasury", address(d.treasury));
        console2.log("Distributor", address(d.distributor));
        console2.log("Staking", address(d.staking));
    }
}
