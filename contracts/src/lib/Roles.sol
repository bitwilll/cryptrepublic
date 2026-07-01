// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Shared AccessControl role identifiers (spec §6.1 roles matrix).
library Roles {
    bytes32 internal constant GENESIS_ATTESTOR_ROLE = keccak256("GENESIS_ATTESTOR_ROLE");
    bytes32 internal constant PASSPORT_ADMIN_ROLE = keccak256("PASSPORT_ADMIN_ROLE");
    bytes32 internal constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 internal constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 internal constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 internal constant FUNDER_ROLE = keccak256("FUNDER_ROLE");
    bytes32 internal constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN_ROLE");
}
