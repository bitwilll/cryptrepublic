// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title WitnessAttestation
/// @notice EIP-712 witness-attestation struct + signature recovery for passport minting.
/// @dev The caller (CryptRepublicPassport) supplies the EIP-712 domain separator, which binds
///      chainId + verifyingContract, so this pure library cannot be replayed across contracts/chains.
library WitnessAttestation {
    struct Attestation {
        address applicant;
        bytes32 nameHash;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 internal constant WITNESS_TYPEHASH =
        keccak256("Attestation(address applicant,bytes32 nameHash,uint256 nonce,uint256 deadline)");

    function structHash(Attestation memory a) internal pure returns (bytes32) {
        return keccak256(abi.encode(WITNESS_TYPEHASH, a.applicant, a.nameHash, a.nonce, a.deadline));
    }

    /// @dev Reverts on malleable/invalid signatures via OZ ECDSA.recover.
    function recoverWitness(bytes32 domainSeparator, Attestation memory a, bytes memory sig)
        internal
        pure
        returns (address)
    {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash(a)));
        return ECDSA.recover(digest, sig);
    }
}
