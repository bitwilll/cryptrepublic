// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPassport} from "./interfaces/IPassport.sol";
import {Roles} from "./lib/Roles.sol";

/// @title DividendDistributor — equal per-citizen dividends per epoch (anti-double-claim).
/// LEGAL: per-citizen dividends make $CRYPT a likely security; resolve before funding (spec §10.1).
contract DividendDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant FUNDER_ROLE = Roles.FUNDER_ROLE;

    struct Epoch {
        uint256 amount;
        uint256 snapshotCitizens;
        uint256 perCitizen;
        uint64 openedAt;
        bool open;
    }

    IPassport public immutable passport;
    IERC20 public immutable crypt;

    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(uint256 => bool)) public claimed; // epochId => tokenId => claimed
    uint256 public currentEpoch;

    error NoCitizens();
    error EpochClosed();
    error NotEligible();
    error NotTokenOwner();
    error AlreadyClaimed();
    error ZeroAddress();

    event EpochOpened(
        uint256 indexed epochId, uint256 amount, uint256 snapshotCitizens, uint256 perCitizen
    );
    event DividendClaimed(
        uint256 indexed epochId, uint256 indexed tokenId, address indexed to, uint256 amount
    );

    constructor(address admin, IPassport passport_, IERC20 crypt_) {
        if (
            admin == address(0) || address(passport_) == address(0) || address(crypt_) == address(0)
        ) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        passport = passport_;
        crypt = crypt_;
    }

    /// LEGAL: opening a funded dividend epoch is a distribution of a likely security (spec §10.1).
    /// @dev PULLS `amount` atomically from the FUNDER so the epoch is BACKED — the caller-supplied
    ///      `amount` can never exceed real deposited funds. The FUNDER (Treasury or admin Safe) must
    ///      `approve` this contract for `amount` first. Keeps the solvency invariant
    ///      `remainingUnclaimed * perCitizen <= crypt.balanceOf(this)` true by construction.
    function openEpoch(uint256 amount)
        external
        onlyRole(FUNDER_ROLE)
        nonReentrant
        returns (uint256 epochId)
    {
        uint256 snapshot = passport.totalCitizens();
        if (snapshot == 0) revert NoCitizens();
        crypt.safeTransferFrom(msg.sender, address(this), amount); // pull funds atomically — backed
        epochId = ++currentEpoch;
        uint256 per = amount / snapshot; // dust (remainder) stays in the contract, favoring protocol
        epochs[epochId] = Epoch({
            amount: amount,
            snapshotCitizens: snapshot,
            perCitizen: per,
            openedAt: uint64(block.timestamp),
            open: true
        });
        emit EpochOpened(epochId, amount, snapshot, per);
    }

    function claim(uint256 epochId, uint256 tokenId) external nonReentrant {
        _claim(epochId, tokenId);
    }

    function claimMany(uint256 epochId, uint256[] calldata tokenIds) external nonReentrant {
        for (uint256 i; i < tokenIds.length; i++) {
            _claim(epochId, tokenIds[i]);
        }
    }

    function _claim(uint256 epochId, uint256 tokenId) internal {
        Epoch storage e = epochs[epochId];
        if (!e.open) revert EpochClosed();
        if (tokenId == 0 || tokenId > e.snapshotCitizens) revert NotEligible();
        if (passport.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (claimed[epochId][tokenId]) revert AlreadyClaimed();

        claimed[epochId][tokenId] = true; // effects (anti-double-claim flag) BEFORE transfer
        uint256 amount = e.perCitizen;
        emit DividendClaimed(epochId, tokenId, msg.sender, amount);
        crypt.safeTransfer(msg.sender, amount);
    }

    function claimable(uint256 epochId, uint256 tokenId) external view returns (uint256) {
        Epoch storage e = epochs[epochId];
        if (!e.open || tokenId == 0 || tokenId > e.snapshotCitizens || claimed[epochId][tokenId]) {
            return 0;
        }
        return e.perCitizen;
    }
}
