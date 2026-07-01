// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Roles} from "./lib/Roles.sol";

/// @notice Minimal view of the DividendDistributor's pull-funded epoch opener (Task 7).
interface IDividendDistributor {
    function openEpoch(uint256 amount) external returns (uint256 epochId);
}

/// @title CryptTreasury — holds funds; disburses ONLY under Governance authorization.
/// LEGAL: treasury outflows/dividend funding may implicate MSB/securities/tax regimes (spec §10.1).
contract CryptTreasury is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant GOVERNANCE_ROLE = Roles.GOVERNANCE_ROLE;

    IERC20 public immutable crypt; // dividends are always paid in $CRYPT (spec §6.5/§6.6)

    mapping(bytes32 => uint16) public allocationBps; // bucket => target bps
    mapping(address => bool) public assetWhitelist;
    uint16 public totalAllocationBps;

    error ZeroAddress();
    error AllocationOverflow();
    error EthTransferFailed();

    event Disbursed(address indexed token, address indexed to, uint256 amount);
    /// @dev (amount, epoch) fields match spec §6.5 `DividendsFunded(amount, epoch)`; the distributor
    ///      is added as an indexed topic for the indexer without changing the spec's core fields.
    event DividendsFunded(address indexed distributor, uint256 amount, uint256 indexed epochId);
    event AllocationSet(bytes32 indexed bucket, uint16 bps);
    event AssetWhitelisted(address indexed token, bool ok);
    event Received(address indexed from, uint256 amount);

    constructor(address admin, IERC20 crypt_) {
        if (admin == address(0) || address(crypt_) == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        crypt = crypt_;
    }

    /// LEGAL: disbursement of a likely-security token / real value — gate + audit before mainnet.
    function disburse(address token, address to, uint256 amount)
        external
        onlyRole(GOVERNANCE_ROLE)
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        emit Disbursed(token, to, amount); // effects/log before interaction
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// LEGAL: dividend funding treats $CRYPT as a distribution of a likely security (spec §10.1).
    /// @dev ATOMIC funding — approve the distributor for `amount` in $CRYPT, then call
    ///      `openEpoch(amount)` (which PULLS the funds) in the SAME tx, so a funded balance and an
    ///      open epoch can never desync. Emits `DividendsFunded(distributor, amount, epochId)`.
    function fundDividends(address distributor, uint256 amount)
        external
        onlyRole(GOVERNANCE_ROLE)
        nonReentrant
        returns (uint256 epochId)
    {
        if (distributor == address(0)) revert ZeroAddress();
        crypt.forceApprove(distributor, amount); // exact allowance for the atomic pull
        epochId = IDividendDistributor(distributor).openEpoch(amount);
        crypt.forceApprove(distributor, 0); // clear residual allowance (defense-in-depth)
        emit DividendsFunded(distributor, amount, epochId);
    }

    function setAllocation(bytes32 bucket, uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint16 newTotal = totalAllocationBps - allocationBps[bucket] + bps;
        if (newTotal > 10_000) revert AllocationOverflow();
        totalAllocationBps = newTotal;
        allocationBps[bucket] = bps;
        emit AllocationSet(bucket, bps);
    }

    function setAssetWhitelist(address token, bool ok) external onlyRole(DEFAULT_ADMIN_ROLE) {
        assetWhitelist[token] = ok;
        emit AssetWhitelisted(token, ok);
    }

    function balanceOf(address token) external view returns (uint256) {
        return token == address(0) ? address(this).balance : IERC20(token).balanceOf(address(this));
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
