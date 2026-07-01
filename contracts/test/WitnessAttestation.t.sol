// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {WitnessAttestation as WA} from "../src/lib/WitnessAttestation.sol";

contract WAHarness {
    function structHash(WA.Attestation memory a) external pure returns (bytes32) {
        return WA.structHash(a);
    }

    function recover(bytes32 ds, WA.Attestation memory a, bytes memory sig)
        external
        pure
        returns (address)
    {
        return WA.recoverWitness(ds, a, sig);
    }
}

contract WitnessAttestationTest is Test {
    WAHarness internal h;
    bytes32 internal constant DS = keccak256("test-domain-separator");

    function setUp() public {
        h = new WAHarness();
    }

    function _digest(WA.Attestation memory a) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DS, WA.structHash(a)));
    }

    function test_RecoversCorrectSigner() public {
        (address witness, uint256 pk) = makeAddrAndKey("witness");
        WA.Attestation memory a = WA.Attestation({
            applicant: makeAddr("applicant"),
            nameHash: keccak256("Ada"),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(a));
        address recovered = h.recover(DS, a, abi.encodePacked(r, s, v));
        assertEq(recovered, witness);
    }

    function test_WrongDomainRecoversDifferentSigner() public {
        (, uint256 pk) = makeAddrAndKey("witness");
        WA.Attestation memory a = WA.Attestation({
            applicant: makeAddr("applicant"),
            nameHash: keccak256("Ada"),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(a));
        // Recover against a DIFFERENT domain separator -> must NOT equal the real witness.
        address recovered = h.recover(keccak256("other-domain"), a, abi.encodePacked(r, s, v));
        assertTrue(recovered != vm.addr(pk));
    }

    function test_TamperedAttestationRecoversDifferentSigner() public {
        (, uint256 pk) = makeAddrAndKey("witness");
        WA.Attestation memory a = WA.Attestation({
            applicant: makeAddr("applicant"),
            nameHash: keccak256("Ada"),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(a));
        // Tamper with the nameHash after signing -> recovery yields a different address.
        a.nameHash = keccak256("Grace");
        address recovered = h.recover(DS, a, abi.encodePacked(r, s, v));
        assertTrue(recovered != vm.addr(pk));
    }

    function test_TypehashIsStable() public view {
        assertEq(
            WA.WITNESS_TYPEHASH,
            keccak256(
                "Attestation(address applicant,bytes32 nameHash,uint256 nonce,uint256 deadline)"
            )
        );
    }

    function testFuzz_SignatureRecovery(uint256 pkSeed, bytes32 nameHash, uint256 nonce) public {
        uint256 pk = bound(pkSeed, 1, type(uint128).max);
        WA.Attestation memory a = WA.Attestation({
            applicant: makeAddr("applicant"),
            nameHash: nameHash,
            nonce: nonce,
            deadline: block.timestamp + 1 hours
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(a));
        assertEq(h.recover(DS, a, abi.encodePacked(r, s, v)), vm.addr(pk));
    }
}
