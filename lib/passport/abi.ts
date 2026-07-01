import { parseAbi } from "viem";

/**
 * FROZEN — generated from the Wave 4 `contracts/src/CryptRepublicPassport.sol`
 * (+ `contracts/src/lib/WitnessAttestation.sol`). Do NOT edit the contract this
 * wave — the ABI is frozen. Every signature below byte-matches the on-chain
 * external surface Wave 5 consumes.
 *
 * The `Attestation` tuple component ORDER is EXACTLY the on-chain struct
 * (`applicant`, `nameHash`, `nonce`, `deadline`) so `mintWithWitnesses` calldata
 * encodes identically to what the contract decodes.
 */
export const passportAbi = parseAbi([
  // ---- struct (shared tuple for mintWithWitnesses) ----
  "struct Attestation { address applicant; bytes32 nameHash; uint256 nonce; uint256 deadline; }",

  // ---- minting ----
  "function mintWithWitnesses(bytes32 nameHash, bytes32 motto, bytes32 domicile, bool oathAccepted, Attestation[] attestations, bytes[] signatures) returns (uint256 tokenId)",
  "function genesisMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile) returns (uint256 tokenId)",
  "function adminMint(address to, bytes32 nameHash, bytes32 motto, bytes32 domicile) returns (uint256 tokenId)",

  // ---- views ----
  "function hasPassport(address) view returns (bool)",
  "function citizenOf(uint256) view returns (bytes32 nameHash, bytes32 motto, bytes32 domicile, bool oathAccepted, uint64 mintBlock)",
  "function totalCitizens() view returns (uint256)",
  "function isCitizen(address who) view returns (bool)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function nonces(address owner) view returns (uint256)",
  "function requiredWitnesses() view returns (uint8)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",

  // ---- events ----
  "event CitizenMinted(uint256 indexed tokenId, address indexed citizen, bytes32 nameHash, uint64 mintBlock)",
  "event WitnessAttested(uint256 indexed tokenId, address indexed witness)",
]);
