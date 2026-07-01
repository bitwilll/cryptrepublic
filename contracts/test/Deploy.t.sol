// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployLib} from "../script/Deploy.s.sol";

contract DeployTest is Test {
    function test_DeployAndConfigureWiring() public {
        // Run deploy + configure AS admin so it holds DEFAULT_ADMIN_ROLE + the genesis supply.
        address admin = address(this); // this test contract is the admin/deployer
        DeployLib.Deployed memory d = DeployLib.deployAll(admin);
        DeployLib.configure(d, admin);

        // Order + non-zero addresses
        assertTrue(address(d.token) != address(0));
        assertTrue(address(d.passport) != address(0));
        // Genesis supply moved admin -> treasury by configure
        assertEq(d.token.balanceOf(address(d.treasury)), 100_000_000e18);
        assertEq(d.token.balanceOf(admin), 0);
        // Distributor + Staking hold MINTER_ROLE on the token
        assertTrue(d.token.hasRole(d.token.MINTER_ROLE(), address(d.distributor)));
        assertTrue(d.token.hasRole(d.token.MINTER_ROLE(), address(d.staking)));
        // Governance holds GOVERNANCE_ROLE on the treasury
        assertTrue(d.treasury.hasRole(d.treasury.GOVERNANCE_ROLE(), address(d.governance)));
        // Treasury holds FUNDER_ROLE on the distributor
        assertTrue(d.distributor.hasRole(d.distributor.FUNDER_ROLE(), address(d.treasury)));
        // Governance allowlists the treasury as an execution target
        assertTrue(d.governance.targetAllowed(address(d.treasury)));
        // Governance carries a non-zero execution delay + a min-citizens proposal floor
        assertGt(d.governance.executionDelay(), 0);
        assertGe(d.governance.minCitizensForProposal(), 1);
        // Passport required witnesses set to 7 by configure
        assertEq(d.passport.requiredWitnesses(), 7);
    }
}
