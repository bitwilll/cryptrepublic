// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title CryptToken ($CRYPT)
/// LEGAL: A dividend-bearing $CRYPT is very likely a regulated security (spec §10.1).
/// LEGAL: Resolve token characterization + KYC/AML before ANY public mainnet distribution.
contract CryptToken is ERC20, ERC20Permit, ERC20Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public immutable MAX_SUPPLY;

    error CapExceeded();
    error ZeroAddress();

    constructor(address admin, address treasury, uint256 initialSupply, uint256 maxSupply)
        ERC20("CryptRepublic Token", "CRYPT")
        ERC20Permit("CryptRepublic Token")
    {
        if (admin == address(0) || treasury == address(0)) revert ZeroAddress();
        if (initialSupply > maxSupply) revert CapExceeded();
        MAX_SUPPLY = maxSupply;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        if (initialSupply > 0) _mint(treasury, initialSupply);
    }

    /// LEGAL: minting expands supply of a likely-security token; gate + audit before mainnet.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (totalSupply() + amount > MAX_SUPPLY) revert CapExceeded();
        _mint(to, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // Resolve the ERC20 / ERC20Pausable multiple-inheritance _update hook (OZ v5).
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}
