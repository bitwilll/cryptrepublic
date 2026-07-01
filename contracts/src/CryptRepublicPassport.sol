// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {WitnessAttestation as WA} from "./lib/WitnessAttestation.sol";
import {Roles} from "./lib/Roles.sol";

/// @title CryptRepublicPassport — soulbound ERC-721 (tokenId == sequential citizen number).
contract CryptRepublicPassport is ERC721, ERC721Burnable, AccessControl, EIP712, Nonces {
    using Strings for uint256;

    bytes32 public constant GENESIS_ATTESTOR_ROLE = Roles.GENESIS_ATTESTOR_ROLE;
    bytes32 public constant PASSPORT_ADMIN_ROLE = Roles.PASSPORT_ADMIN_ROLE;

    struct Citizen {
        bytes32 nameHash;
        bytes32 motto;
        bytes32 domicile;
        bool oathAccepted;
        uint64 mintBlock;
    }

    uint256 private _nextCitizenNumber = 1; // tokenId = citizen number, starts at 1
    uint8 public requiredWitnesses;
    string private _baseTokenURI;
    bool public burnEnabled;

    mapping(uint256 => Citizen) public citizenOf;
    mapping(address => bool) public hasPassport;

    error Soulbound();
    error AlreadyCitizen();
    error NotEnoughWitnesses();
    error DuplicateWitness();
    error SelfAttestation();
    error ApplicantMismatch();
    error BadNonce();
    error WitnessNotCitizen();
    error DeadlineExpired();
    error ArrayLengthMismatch();
    error BurnDisabled();
    error NotTokenOwner();
    error ZeroAddress();
    error WitnessMintDisabled();
    error NameHashMismatch();

    event CitizenMinted(
        uint256 indexed tokenId, address indexed citizen, bytes32 nameHash, uint64 mintBlock
    );
    event CitizenRenounced(uint256 indexed tokenId, address indexed citizen);
    event WitnessAttested(uint256 indexed tokenId, address indexed witness);
    event RequiredWitnessesSet(uint8 n);
    event BaseURISet(string uri);
    event BurnEnabledSet(bool enabled);

    constructor(address admin, string memory baseURI_)
        ERC721("CryptRepublic Passport", "CRPASS")
        EIP712("CryptRepublicPassport", "1")
    {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _baseTokenURI = baseURI_;
        // spec: "7 Witnesses"; NEVER default 0 (would open a zero-witness self-mint window)
        requiredWitnesses = 7;
    }

    // ---- Minting ----

    /// LEGAL: passport gates dividends/governance; KYC/Sybil resistance is a pre-mainnet concern (§10.1).
    function mintWithWitnesses(
        bytes32 nameHash,
        bytes32 motto,
        bytes32 domicile,
        bool oathAccepted,
        WA.Attestation[] calldata attestations,
        bytes[] calldata signatures
    ) external returns (uint256 tokenId) {
        if (requiredWitnesses == 0) revert WitnessMintDisabled(); // inert until admin sets a floor
        if (hasPassport[msg.sender]) revert AlreadyCitizen();
        if (attestations.length != signatures.length) revert ArrayLengthMismatch();
        if (attestations.length < requiredWitnesses) revert NotEnoughWitnesses();

        uint256 nonce = _useNonce(msg.sender); // per-applicant replay protection
        bytes32 ds = _domainSeparatorV4();
        address[] memory seen = new address[](attestations.length);

        for (uint256 i; i < attestations.length; i++) {
            WA.Attestation calldata a = attestations[i];
            if (a.applicant != msg.sender) revert ApplicantMismatch();
            if (a.nonce != nonce) revert BadNonce();
            if (a.nameHash != nameHash) revert NameHashMismatch(); // witnesses attest to THIS citizen
            if (a.deadline < block.timestamp) revert DeadlineExpired();

            address witness = WA.recoverWitness(ds, a, signatures[i]);
            if (witness == msg.sender) revert SelfAttestation();
            if (!hasPassport[witness]) revert WitnessNotCitizen();
            for (uint256 j; j < i; j++) {
                if (seen[j] == witness) revert DuplicateWitness();
            }
            seen[i] = witness;
        }

        tokenId = _mintCitizen(msg.sender, nameHash, motto, domicile, oathAccepted);
        for (uint256 i; i < attestations.length; i++) {
            emit WitnessAttested(tokenId, seen[i]);
        }
    }

    function genesisMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)
        external
        onlyRole(GENESIS_ATTESTOR_ROLE)
        returns (uint256 tokenId)
    {
        tokenId = _mintCitizen(to, nameHash, motto, domicile, true);
    }

    function adminMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile)
        external
        onlyRole(PASSPORT_ADMIN_ROLE)
        returns (uint256 tokenId)
    {
        tokenId = _mintCitizen(to, nameHash, motto, domicile, true);
    }

    function _mintCitizen(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile, bool oath)
        internal
        returns (uint256 tokenId)
    {
        if (to == address(0)) revert ZeroAddress();
        if (hasPassport[to]) revert AlreadyCitizen();
        tokenId = _nextCitizenNumber++;
        hasPassport[to] = true;
        citizenOf[tokenId] = Citizen({
            nameHash: nameHash,
            motto: motto,
            domicile: domicile,
            oathAccepted: oath,
            mintBlock: uint64(block.number)
        });
        _safeMint(to, tokenId);
        emit CitizenMinted(tokenId, to, nameHash, uint64(block.number));
    }

    // ---- Renounce / burn ----

    function renounce(uint256 tokenId) external {
        _renounce(tokenId);
    }

    /// @dev OVERRIDES the inherited public `ERC721Burnable.burn` so it CANNOT bypass the
    ///      `burnEnabled` gate or leave `hasPassport[owner] == true` (which would brick the address).
    ///      Routes through the SAME policy as `renounce`.
    function burn(uint256 tokenId) public override {
        _renounce(tokenId);
    }

    function _renounce(uint256 tokenId) internal {
        if (!burnEnabled) revert BurnDisabled();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        hasPassport[msg.sender] = false; // clear FIRST so isCitizen == (balanceOf == 1) holds
        _burn(tokenId);
        emit CitizenRenounced(tokenId, msg.sender);
    }

    // ---- Soulbound enforcement ----

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound(); // allow mint & burn only
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // ---- Views ----

    function totalCitizens() external view returns (uint256) {
        return _nextCitizenNumber - 1;
    }

    function isCitizen(address who) external view returns (bool) {
        return hasPassport[who];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseTokenURI, tokenId.toString());
    }

    /// @notice Exposes the EIP-712 domain separator (chainId + verifyingContract bound) so witnesses
    ///         and the frontend can build the same digest the contract verifies.
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---- Admin setters ----

    function setRequiredWitnesses(uint8 n) external onlyRole(PASSPORT_ADMIN_ROLE) {
        require(n <= 10, "witnesses>10"); // gas bound (spec §6.8)
        requiredWitnesses = n;
        emit RequiredWitnessesSet(n);
    }

    function setBaseURI(string calldata uri) external onlyRole(PASSPORT_ADMIN_ROLE) {
        _baseTokenURI = uri;
        emit BaseURISet(uri);
    }

    function setBurnEnabled(bool enabled) external onlyRole(PASSPORT_ADMIN_ROLE) {
        burnEnabled = enabled;
        emit BurnEnabledSet(enabled);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
