// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Roles} from "./lib/Roles.sol";

/// @title CryptStaking — stake $CRYPT, accrue linear-APR rewards; payouts bounded by funded reserve.
/// @dev Rewards use the Synthetix-style `rewardPerToken` accumulator so APR changes are GENUINELY
///      prospective (spec §6.7 "prospective only"): elapsed time is priced at the rate in force AT
///      THAT TIME, never re-priced when `setApr` changes the rate. `setApr` checkpoints the accumulator
///      FIRST, so already-elapsed time is locked at the old rate before the new rate takes effect.
contract CryptStaking is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant REWARDS_ADMIN_ROLE = Roles.REWARDS_ADMIN_ROLE;
    uint256 public constant YEAR = 365 days;
    uint256 public constant PRECISION = 1e18; // fixed-point scale for the accumulator

    struct StakeInfo {
        uint256 amount;
        uint256 rewardAccrued; // settled, unclaimed rewards (checkpointed)
        uint256 userRewardPerTokenPaid; // accumulator value at the user's last checkpoint
    }

    IERC20 public immutable crypt;
    uint16 public aprBps;
    uint256 public totalStaked;
    uint256 public rewardPoolRemaining;

    // ---- Synthetix accumulator (global) ----
    uint256 public rewardPerTokenStored; // scaled by PRECISION
    uint64 public lastUpdate; // last time the accumulator advanced

    mapping(address => StakeInfo) public stakes;

    error ZeroAmount();
    error InsufficientStake();
    error ZeroAddress();

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event AprSet(uint16 bps);
    event RewardsFunded(uint256 amount);

    constructor(address admin, IERC20 crypt_, uint16 aprBps_) {
        if (admin == address(0) || address(crypt_) == address(0)) revert ZeroAddress();
        require(aprBps_ <= 50_000, "apr>500%");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        crypt = crypt_;
        aprBps = aprBps_;
        lastUpdate = uint64(block.timestamp);
    }

    /// @notice Global accumulator incl. the yet-unbanked elapsed time at the CURRENT rate.
    /// @dev rewardPerToken grows by (aprBps * elapsed / (YEAR * 10000)) * PRECISION each second,
    ///      independent of totalStaked (linear-APR: each staked token earns aprBps/yr regardless of pool).
    function rewardPerToken() public view returns (uint256) {
        uint256 elapsed = block.timestamp - lastUpdate;
        if (elapsed == 0) return rewardPerTokenStored;
        return rewardPerTokenStored + (aprBps * elapsed * PRECISION) / (YEAR * 10_000);
    }

    /// @dev Checkpoints the global accumulator, then (if `user != address(0)`) banks the user's accrual
    ///      at the accumulator value in force so far. Called FIRST on every mutating path (incl. setApr).
    function _updateReward(address user) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdate = uint64(block.timestamp);
        if (user != address(0)) {
            StakeInfo storage s = stakes[user];
            s.rewardAccrued +=
                (s.amount * (rewardPerTokenStored - s.userRewardPerTokenPaid)) / PRECISION;
            s.userRewardPerTokenPaid = rewardPerTokenStored;
        }
    }

    modifier updateReward(address user) {
        _updateReward(user);
        _;
    }

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        stakes[msg.sender].amount += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
        crypt.safeTransferFrom(msg.sender, address(this), amount); // interaction last
    }

    function unstake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        StakeInfo storage s = stakes[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > s.amount) revert InsufficientStake();
        s.amount -= amount;
        totalStaked -= amount;
        emit Unstaked(msg.sender, amount);
        crypt.safeTransfer(msg.sender, amount);
    }

    function claim() external nonReentrant updateReward(msg.sender) {
        StakeInfo storage s = stakes[msg.sender];
        uint256 payout = s.rewardAccrued;
        if (payout > rewardPoolRemaining) payout = rewardPoolRemaining; // bounded by funded reserve
        if (payout == 0) return;
        s.rewardAccrued -= payout;
        rewardPoolRemaining -= payout;
        emit RewardClaimed(msg.sender, payout);
        crypt.safeTransfer(msg.sender, payout);
    }

    function earned(address user) public view returns (uint256) {
        StakeInfo storage s = stakes[user];
        return
            s.rewardAccrued + (s.amount * (rewardPerToken() - s.userRewardPerTokenPaid)) / PRECISION;
    }

    /// @dev PROSPECTIVE: checkpoint the accumulator at the OLD rate BEFORE switching, so already-elapsed
    ///      time is locked at the old rate and only future time uses the new rate (spec §6.7).
    function setApr(uint16 bps) external onlyRole(REWARDS_ADMIN_ROLE) updateReward(address(0)) {
        require(bps <= 50_000, "apr>500%");
        aprBps = bps;
        emit AprSet(bps);
    }

    function fundRewards(uint256 amount) external onlyRole(REWARDS_ADMIN_ROLE) {
        rewardPoolRemaining += amount;
        emit RewardsFunded(amount);
        crypt.safeTransferFrom(msg.sender, address(this), amount);
    }
}
