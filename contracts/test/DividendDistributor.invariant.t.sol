// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DividendDistributor} from "../src/DividendDistributor.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";
import {IPassport} from "../src/interfaces/IPassport.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DistHandler is Test {
    DividendDistributor internal dist;
    address[] internal citizens;

    uint256 public epochId;
    uint256 public perCitizen;
    uint256 public snapshot;
    uint256 public totalClaimed;
    uint256 public claimedCount;
    mapping(uint256 => bool) public claimedMirror;

    constructor(
        DividendDistributor _dist,
        address[] memory _citizens,
        uint256 _epochId,
        uint256 _perCitizen,
        uint256 _snapshot
    ) {
        dist = _dist;
        citizens = _citizens;
        epochId = _epochId;
        perCitizen = _perCitizen;
        snapshot = _snapshot;
    }

    function claim(uint256 idx) external {
        uint256 i = idx % citizens.length;
        uint256 tokenId = i + 1;
        vm.prank(citizens[i]);
        try dist.claim(epochId, tokenId) {
            if (!claimedMirror[tokenId]) {
                claimedMirror[tokenId] = true;
                totalClaimed += perCitizen;
                claimedCount++;
            }
        } catch {}
    }

    function remainingUnclaimed() external view returns (uint256) {
        return snapshot - claimedCount;
    }
}

contract DividendDistributorInvariant is Test {
    DividendDistributor internal dist;
    CryptRepublicPassport internal p;
    MockERC20 internal crypt;
    DistHandler internal handler;
    address internal admin = makeAddr("admin");
    address internal genesis = makeAddr("genesis");
    address internal funder = makeAddr("funder");

    function setUp() public {
        crypt = new MockERC20("CRYPT", "CRYPT");
        p = new CryptRepublicPassport(admin, "uri/");
        bytes32 gr = p.GENESIS_ATTESTOR_ROLE();
        vm.prank(admin);
        p.grantRole(gr, genesis);
        dist = new DividendDistributor(admin, IPassport(address(p)), IERC20(address(crypt)));
        bytes32 fr = dist.FUNDER_ROLE();
        vm.prank(admin);
        dist.grantRole(fr, funder);

        address[] memory citizens = new address[](5);
        for (uint256 i; i < 5; i++) {
            citizens[i] = makeAddr(string.concat("dc", vm.toString(i)));
            vm.prank(genesis);
            p.genesisMint(
                citizens[i], keccak256(abi.encode(citizens[i])), bytes32("m"), bytes32("d")
            );
        }

        uint256 amount = 1_000_000e18 + 3; // has dust
        crypt.mint(funder, amount);
        vm.startPrank(funder);
        crypt.approve(address(dist), amount);
        uint256 epochId = dist.openEpoch(amount);
        vm.stopPrank();
        (uint256 snap, uint256 per) = _epochInfo(epochId);

        handler = new DistHandler(dist, citizens, epochId, per, snap);
        targetContract(address(handler));
    }

    function _epochInfo(uint256 epochId) internal view returns (uint256 snap, uint256 per) {
        (, snap, per,,) = dist.epochs(epochId);
    }

    function invariant_NoDoubleClaim() public view {
        (uint256 amount,,,,) = dist.epochs(handler.epochId());
        assertLe(handler.totalClaimed(), amount);
        for (uint256 tid = 1; tid <= 5; tid++) {
            assertEq(handler.claimedMirror(tid), dist.claimed(handler.epochId(), tid));
        }
    }

    function invariant_SolvencyBacked() public view {
        // Every still-claimable dividend is fully token-backed (openEpoch pulled the funds).
        uint256 owed = handler.remainingUnclaimed() * handler.perCitizen();
        assertLe(owed, crypt.balanceOf(address(dist)));
    }
}
