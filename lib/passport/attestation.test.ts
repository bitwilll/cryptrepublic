// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  keccak256,
  encodeAbiParameters,
  toHex,
  stringToHex,
  concat,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  ATTESTATION_TYPES,
  attestationDomain,
  attestationDigest,
  recoverWitness,
  nameHashOf,
  toBytes32String,
  decodeBytes32String,
  type Attestation,
} from "./attestation";

const CHAIN_ID = 31337;
const VERIFYING = "0x1111111111111111111111111111111111111111" as Address;

const WITNESS_TYPEHASH = keccak256(
  toHex("Attestation(address applicant,bytes32 nameHash,uint256 nonce,uint256 deadline)"),
);

// EIP-712 domain typehash for a { name, version, chainId, verifyingContract } domain.
const DOMAIN_TYPEHASH = keccak256(
  toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);

function manualDomainSeparator(chainId: number, verifyingContract: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        DOMAIN_TYPEHASH,
        keccak256(toHex("CryptRepublicPassport")),
        keccak256(toHex("1")),
        BigInt(chainId),
        verifyingContract,
      ],
    ),
  );
}

function manualDigest(chainId: number, verifyingContract: Address, a: Attestation): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [WITNESS_TYPEHASH, a.applicant, a.nameHash, a.nonce, a.deadline],
    ),
  );
  const ds = manualDomainSeparator(chainId, verifyingContract);
  return keccak256(concat(["0x1901", ds, structHash]));
}

describe("EIP-712 Attestation builder", () => {
  const attestation: Attestation = {
    applicant: "0x00000000000000000000000000000000000000A1" as Address,
    nameHash: nameHashOf("A. Nakadai"),
    nonce: 3n,
    deadline: 1_800_000_000n,
  };

  it("attestationDigest matches the manually-reconstructed contract digest (typehash + domain)", () => {
    expect(attestationDigest(CHAIN_ID, VERIFYING, attestation)).toBe(
      manualDigest(CHAIN_ID, VERIFYING, attestation),
    );
  });

  it("a viem-signed attestation recovers to the signer", async () => {
    const signer = privateKeyToAccount(generatePrivateKey());
    const domain = attestationDomain(CHAIN_ID, VERIFYING);
    const sig = await signer.signTypedData({
      domain,
      types: ATTESTATION_TYPES,
      primaryType: "Attestation",
      message: attestation,
    });
    const recovered = await recoverWitness(CHAIN_ID, VERIFYING, attestation, sig);
    expect(recovered.toLowerCase()).toBe(signer.address.toLowerCase());
  });

  it("nameHashOf equals keccak256(stringToHex(name))", () => {
    expect(nameHashOf("A. Nakadai")).toBe(keccak256(stringToHex("A. Nakadai")));
  });

  it("toBytes32String produces a right-padded 32-byte hex and throws over 31 bytes", () => {
    const b = toBytes32String("Genesis");
    expect(b).toHaveLength(66); // 0x + 64
    expect(b.startsWith("0x")).toBe(true);
    expect(() => toBytes32String("x".repeat(32))).toThrow();
  });

  it("toBytes32String matches the Solidity bytes32(...) short-string encoding (Founder)", () => {
    // ASCII of "Founder" right-padded to 32 bytes — identical to Solidity bytes32("Founder")
    // used in SeedGenesis.s.sol.
    expect(toBytes32String("Founder")).toBe(
      "0x466f756e64657200000000000000000000000000000000000000000000000000",
    );
  });

  it("decodeBytes32String round-trips for Lisbon and Founder", () => {
    expect(decodeBytes32String(toBytes32String("Lisbon"))).toBe("Lisbon");
    expect(decodeBytes32String(toBytes32String("Founder"))).toBe("Founder");
  });
});
