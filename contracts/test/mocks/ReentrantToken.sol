// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice A faithful minimal ERC-20 whose `transfer` optionally re-enters a target contract,
///         used to prove `nonReentrant` blocks reentrancy on CryptTreasury.disburse.
contract ReentrantToken is IERC20 {
    string public name = "Reentrant";
    string public symbol = "RE";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Reentrancy hook config
    address public reentryTarget;
    bytes public reentryCalldata;
    bool public reentryArmed;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function arm(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryCalldata = data;
        reentryArmed = true;
    }

    function disarm() external {
        reentryArmed = false;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        // On transfer OUT of the treasury, attempt reentry.
        if (reentryArmed && reentryTarget != address(0)) {
            (bool ok,) = reentryTarget.call(reentryCalldata);
            // bubble up the revert so the outer call reverts (proving nonReentrant fired)
            require(ok, "reentry-blocked");
        }
    }
}
