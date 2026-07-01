// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CryptRepublicPassport} from "../src/CryptRepublicPassport.sol";
import {WitnessAttestation as WA} from "../src/lib/WitnessAttestation.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract CryptRepublicPassportTest is Test {
    CryptRepublicPassport internal passport;
    address internal admin = makeAddr("admin");
    address internal genesis = makeAddr("genesis");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        passport = new CryptRepublicPassport(admin, "https://api.cryptrepublic.test/passport/");
        vm.startPrank(admin);
        passport.grantRole(passport.GENESIS_ATTESTOR_ROLE(), genesis);
        passport.grantRole(passport.PASSPORT_ADMIN_ROLE(), admin);
        passport.setRequiredWitnesses(3);
        vm.stopPrank();
    }

    function _genMint(address to) internal returns (uint256) {
        vm.prank(genesis);
        return passport.genesisMint(to, keccak256(abi.encode(to)), bytes32("motto"), bytes32("dom"));
    }

    function test_ConstructorDefaultsRequiredWitnessesToSeven() public {
        CryptRepublicPassport fresh = new CryptRepublicPassport(admin, "uri/");
        assertEq(fresh.requiredWitnesses(), 7);
    }

    function test_ConstructorRevertsZeroAdmin() public {
        vm.expectRevert(CryptRepublicPassport.ZeroAddress.selector);
        new CryptRepublicPassport(address(0), "uri/");
    }

    function test_Metadata() public view {
        assertEq(passport.name(), "CryptRepublic Passport");
        assertEq(passport.symbol(), "CRPASS");
    }

    function test_GenesisMintSequentialNumbering() public {
        uint256 id1 = _genMint(alice);
        uint256 id2 = _genMint(bob);
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(passport.totalCitizens(), 2);
        assertEq(passport.ownerOf(1), alice);
        assertTrue(passport.isCitizen(alice));
    }

    function test_CitizenStructRecorded() public {
        _genMint(alice);
        (bytes32 nameHash,, bytes32 domicile, bool oath, uint64 mintBlock) = passport.citizenOf(1);
        assertEq(nameHash, keccak256(abi.encode(alice)));
        assertEq(domicile, bytes32("dom"));
        assertTrue(oath);
        assertEq(mintBlock, uint64(block.number));
    }

    function test_OnePassportPerAddress() public {
        _genMint(alice);
        vm.prank(genesis);
        vm.expectRevert(CryptRepublicPassport.AlreadyCitizen.selector);
        passport.genesisMint(alice, keccak256("x"), bytes32("m"), bytes32("d"));
    }

    function test_GenesisMintZeroAddressReverts() public {
        vm.prank(genesis);
        vm.expectRevert(CryptRepublicPassport.ZeroAddress.selector);
        passport.genesisMint(address(0), keccak256("x"), bytes32("m"), bytes32("d"));
    }

    function test_AdminMint() public {
        vm.prank(admin);
        uint256 id = passport.adminMint(alice, keccak256("x"), bytes32("m"), bytes32("d"));
        assertEq(id, 1);
        assertTrue(passport.isCitizen(alice));
    }

    function test_NonAdminCannotAdminMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                passport.PASSPORT_ADMIN_ROLE()
            )
        );
        vm.prank(alice);
        passport.adminMint(alice, keccak256("x"), bytes32("m"), bytes32("d"));
    }

    function test_TransferReverts() public {
        _genMint(alice);
        vm.prank(alice);
        vm.expectRevert(CryptRepublicPassport.Soulbound.selector);
        passport.transferFrom(alice, bob, 1);
    }

    function test_SafeTransferReverts() public {
        _genMint(alice);
        vm.prank(alice);
        vm.expectRevert(CryptRepublicPassport.Soulbound.selector);
        passport.safeTransferFrom(alice, bob, 1);
    }

    function test_ApproveReverts() public {
        _genMint(alice);
        vm.prank(alice);
        vm.expectRevert(CryptRepublicPassport.Soulbound.selector);
        passport.approve(bob, 1);
    }

    function test_SetApprovalForAllReverts() public {
        vm.prank(alice);
        vm.expectRevert(CryptRepublicPassport.Soulbound.selector);
        passport.setApprovalForAll(bob, true);
    }

    function test_NonGenesisCannotGenesisMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                passport.GENESIS_ATTESTOR_ROLE()
            )
        );
        vm.prank(alice);
        passport.genesisMint(alice, keccak256("x"), bytes32("m"), bytes32("d"));
    }

    function test_RenounceOnlyWhenEnabled() public {
        _genMint(alice);
        vm.prank(alice);
        vm.expectRevert(CryptRepublicPassport.BurnDisabled.selector);
        passport.renounce(1);
        vm.prank(admin);
        passport.setBurnEnabled(true);
        vm.prank(alice);
        passport.renounce(1);
        assertFalse(passport.isCitizen(alice));
        // totalCitizens counter does NOT decrement (numbering monotonic); balanceOf drops to 0.
        assertEq(passport.balanceOf(alice), 0);
        assertEq(passport.totalCitizens(), 1);
    }

    function test_RenounceNotOwnerReverts() public {
        _genMint(alice);
        vm.prank(admin);
        passport.setBurnEnabled(true);
        vm.prank(bob);
        vm.expectRevert(CryptRepublicPassport.NotTokenOwner.selector);
        passport.renounce(1);
    }

    function test_TokenURI() public {
        _genMint(alice);
        assertEq(passport.tokenURI(1), "https://api.cryptrepublic.test/passport/1");
    }

    function test_SetBaseURI() public {
        _genMint(alice);
        vm.prank(admin);
        passport.setBaseURI("ipfs://new/");
        assertEq(passport.tokenURI(1), "ipfs://new/1");
    }

    function test_SupportsInterface() public view {
        // ERC721 interfaceId
        assertTrue(passport.supportsInterface(0x80ac58cd));
        // AccessControl (IAccessControl) interfaceId
        assertTrue(passport.supportsInterface(0x7965db0b));
    }

    function test_SetRequiredWitnessesAboveTenReverts() public {
        vm.prank(admin);
        vm.expectRevert(bytes("witnesses>10"));
        passport.setRequiredWitnesses(11);
    }

    // ---- Witness minting ----

    function _mkWitnesses(uint256 count)
        internal
        returns (address[] memory w, uint256[] memory pk)
    {
        w = new address[](count);
        pk = new uint256[](count);
        for (uint256 i; i < count; i++) {
            (w[i], pk[i]) = makeAddrAndKey(string.concat("w", vm.toString(i)));
            vm.prank(genesis);
            passport.genesisMint(w[i], keccak256(abi.encode(w[i])), bytes32("m"), bytes32("d"));
        }
    }

    function _signAtt(uint256 pk, address applicant, bytes32 nameHash, uint256 nonce)
        internal
        view
        returns (WA.Attestation memory a, bytes memory sig)
    {
        a = WA.Attestation({
            applicant: applicant,
            nameHash: nameHash,
            nonce: nonce,
            deadline: block.timestamp + 1 hours
        });
        bytes32 ds = passport.DOMAIN_SEPARATOR();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ds, WA.structHash(a)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _buildAttestations(uint256[] memory pks, address applicant, bytes32 nameHash)
        internal
        view
        returns (WA.Attestation[] memory atts, bytes[] memory sigs)
    {
        uint256 nonce = passport.nonces(applicant);
        atts = new WA.Attestation[](pks.length);
        sigs = new bytes[](pks.length);
        for (uint256 i; i < pks.length; i++) {
            (atts[i], sigs[i]) = _signAtt(pks[i], applicant, nameHash, nonce);
        }
    }

    function test_MintWithWitnessesHappyPath() public {
        (, uint256[] memory pk) = _mkWitnesses(3);
        address dave = makeAddr("dave");
        bytes32 nameHash = keccak256("Dave");
        (WA.Attestation[] memory atts, bytes[] memory sigs) = _buildAttestations(pk, dave, nameHash);
        vm.prank(dave);
        uint256 id =
            passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
        assertEq(id, 4); // 3 witnesses minted first
        assertTrue(passport.isCitizen(dave));
    }

    function test_MintWithWitnessesNotEnough() public {
        (, uint256[] memory pk) = _mkWitnesses(2);
        address dave = makeAddr("dave");
        bytes32 nameHash = keccak256("Dave");
        (WA.Attestation[] memory atts, bytes[] memory sigs) = _buildAttestations(pk, dave, nameHash);
        vm.prank(dave);
        vm.expectRevert(CryptRepublicPassport.NotEnoughWitnesses.selector);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
    }

    function test_MintWithWitnessesArrayMismatch() public {
        (, uint256[] memory pk) = _mkWitnesses(3);
        address dave = makeAddr("dave");
        bytes32 nameHash = keccak256("Dave");
        (WA.Attestation[] memory atts, bytes[] memory sigs) = _buildAttestations(pk, dave, nameHash);
        bytes[] memory shortSigs = new bytes[](2);
        shortSigs[0] = sigs[0];
        shortSigs[1] = sigs[1];
        vm.prank(dave);
        vm.expectRevert(CryptRepublicPassport.ArrayLengthMismatch.selector);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, shortSigs);
    }

    function test_MintWithWitnessesDuplicate() public {
        (, uint256[] memory pk) = _mkWitnesses(3);
        // Replace witness #2 with witness #0 (duplicate).
        pk[2] = pk[0];
        address dave = makeAddr("dave");
        bytes32 nameHash = keccak256("Dave");
        (WA.Attestation[] memory atts, bytes[] memory sigs) = _buildAttestations(pk, dave, nameHash);
        vm.prank(dave);
        vm.expectRevert(CryptRepublicPassport.DuplicateWitness.selector);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
    }

    function test_MintWithWitnessesNonCitizenSigner() public {
        (, uint256[] memory pk) = _mkWitnesses(2);
        (, uint256 outsiderPk) = makeAddrAndKey("outsider"); // not a citizen
        uint256[] memory pks = new uint256[](3);
        pks[0] = pk[0];
        pks[1] = pk[1];
        pks[2] = outsiderPk;
        address dave = makeAddr("dave");
        bytes32 nameHash = keccak256("Dave");
        (WA.Attestation[] memory atts, bytes[] memory sigs) =
            _buildAttestations(pks, dave, nameHash);
        vm.prank(dave);
        vm.expectRevert(CryptRepublicPassport.WitnessNotCitizen.selector);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
    }

    function test_MintWithWitnessesDeadlineExpired() public {
        (, uint256[] memory pk) = _mkWitnesses(3);
        address dave = makeAddr("dave");
        bytes32 nameHash = keccak256("Dave");
        (WA.Attestation[] memory atts, bytes[] memory sigs) = _buildAttestations(pk, dave, nameHash);
        vm.warp(block.timestamp + 2 hours); // past the 1-hour deadline
        vm.prank(dave);
        vm.expectRevert(CryptRepublicPassport.DeadlineExpired.selector);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
    }

    function test_MintWithWitnessesSelfAttestation() public {
        (, uint256[] memory pk) = _mkWitnesses(2);
        // Eve (fresh applicant) signs one of her own attestations. The recovered signer == msg.sender
        // trips the SelfAttestation guard (which is checked before the is-citizen guard).
        (address eve, uint256 evePk) = makeAddrAndKey("eve");
        uint256[] memory pks = new uint256[](3);
        pks[0] = pk[0];
        pks[1] = pk[1];
        pks[2] = evePk; // eve signs her own attestation
        bytes32 nameHash = keccak256("Eve");
        (WA.Attestation[] memory atts, bytes[] memory sigs) = _buildAttestations(pks, eve, nameHash);
        vm.prank(eve);
        vm.expectRevert(CryptRepublicPassport.SelfAttestation.selector);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
    }

    function test_MintWithWitnessesReplayReverts() public {
        (, uint256[] memory pk) = _mkWitnesses(3);
        address dave = makeAddr("dave");
        bytes32 nameHash = keccak256("Dave");
        (WA.Attestation[] memory atts, bytes[] memory sigs) = _buildAttestations(pk, dave, nameHash);
        vm.prank(dave);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
        // Replay the SAME attestations (now dave has a passport) -> AlreadyCitizen.
        vm.prank(dave);
        vm.expectRevert(CryptRepublicPassport.AlreadyCitizen.selector);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
    }

    function test_MintWithWitnessesStaleNonceReverts() public {
        (, uint256[] memory pk) = _mkWitnesses(3);
        address dave = makeAddr("dave");
        bytes32 nameHash = keccak256("Dave");
        // Sign against nonce 1 while the applicant's current nonce is 0.
        WA.Attestation[] memory atts = new WA.Attestation[](3);
        bytes[] memory sigs = new bytes[](3);
        for (uint256 i; i < 3; i++) {
            (atts[i], sigs[i]) = _signAtt(pk[i], dave, nameHash, 1);
        }
        vm.prank(dave);
        vm.expectRevert(CryptRepublicPassport.BadNonce.selector);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
    }

    function test_MintWithWitnessesApplicantMismatchReverts() public {
        (, uint256[] memory pk) = _mkWitnesses(3);
        address dave = makeAddr("dave");
        address other = makeAddr("other");
        bytes32 nameHash = keccak256("Dave");
        // Attestations name `other` as applicant but dave calls.
        (WA.Attestation[] memory atts, bytes[] memory sigs) =
            _buildAttestations(pk, other, nameHash);
        vm.prank(dave);
        vm.expectRevert(CryptRepublicPassport.ApplicantMismatch.selector);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
    }

    function test_witnessNameHashMustMatch() public {
        vm.prank(admin);
        passport.setRequiredWitnesses(7);
        (, uint256[] memory pks) = _mkWitnesses(7);
        address dave = makeAddr("dave");
        // witnesses attest to keccak256("Dave") but dave mints as keccak256("NotDave")
        (WA.Attestation[] memory atts, bytes[] memory sigs) =
            _buildAttestations(pks, dave, keccak256("Dave"));
        vm.prank(dave);
        vm.expectRevert(CryptRepublicPassport.NameHashMismatch.selector);
        passport.mintWithWitnesses(
            keccak256("NotDave"), bytes32("m"), bytes32("d"), true, atts, sigs
        );
    }

    function test_burnRevertsWhenBurnDisabled() public {
        _genMint(alice);
        vm.prank(alice);
        vm.expectRevert(CryptRepublicPassport.BurnDisabled.selector);
        passport.burn(1);
        // enable and burn -> hasPassport cleared, no stale flag
        vm.prank(admin);
        passport.setBurnEnabled(true);
        vm.prank(alice);
        passport.burn(1);
        assertFalse(passport.isCitizen(alice));
        assertFalse(passport.hasPassport(alice));
        assertEq(passport.balanceOf(alice), 0);
    }

    function test_witnessMintInertWhenUnconfigured() public {
        vm.prank(admin);
        passport.setRequiredWitnesses(0);
        (, uint256[] memory pk) = _mkWitnesses(1);
        address dave = makeAddr("dave");
        bytes32 nameHash = keccak256("Dave");
        (WA.Attestation[] memory atts, bytes[] memory sigs) = _buildAttestations(pk, dave, nameHash);
        vm.prank(dave);
        vm.expectRevert(CryptRepublicPassport.WitnessMintDisabled.selector);
        passport.mintWithWitnesses(nameHash, bytes32("m"), bytes32("d"), true, atts, sigs);
    }

    function testFuzz_mintOncePerAddress(uint256 seed) public {
        address who = address(uint160(uint256(keccak256(abi.encode(seed))) | 1));
        vm.prank(genesis);
        passport.genesisMint(who, keccak256("x"), bytes32("m"), bytes32("d"));
        vm.prank(genesis);
        vm.expectRevert(CryptRepublicPassport.AlreadyCitizen.selector);
        passport.genesisMint(who, keccak256("y"), bytes32("m"), bytes32("d"));
    }
}
