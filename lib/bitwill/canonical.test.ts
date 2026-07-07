// @vitest-environment node
import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, recoverMessageAddress, sha256, stringToBytes } from "viem";
import {
  BITWILL_PAYLOAD_VERSION,
  NO_BENEFICIARY_ADDRESS,
  canonicalBitwillPayload,
  directiveHashOf,
  estateHash,
} from "./canonical";

/**
 * BitWill canonical payload (Wave 15 A). The payload is the EXACT string the
 * wallet signs — client and server must derive it byte-for-byte from the same
 * fields. Cross-checked against a manual reconstruction and a real viem
 * sign→recover round trip (the attestation.test.ts convention).
 */

// The well-known local test key (anvil account #0) — NEVER a real key.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const OWNER = privateKeyToAccount(TEST_KEY); // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

const BASE = {
  owner: OWNER.address,
  beneficiaryName: "Ada Lovelace",
  beneficiaryContact: "ada@example.com",
  assetsMemo: "All CRPT holdings and the library of engines.",
};

describe("canonicalBitwillPayload", () => {
  it("matches the documented v1 format line for line", () => {
    const payload = canonicalBitwillPayload(BASE);
    expect(payload).toBe(
      [
        BITWILL_PAYLOAD_VERSION,
        `OWNER: ${OWNER.address}`,
        "BENEFICIARY: Ada Lovelace",
        "CONTACT: ada@example.com",
        `BENEFICIARY-ADDRESS: ${NO_BENEFICIARY_ADDRESS}`,
        `ESTATE: ${sha256(stringToBytes(BASE.assetsMemo))}`,
      ].join("\n"),
    );
  });

  it("checksums the owner and beneficiary addresses (case-insensitive input, EIP-55 output)", () => {
    const lower = canonicalBitwillPayload({
      ...BASE,
      owner: OWNER.address.toLowerCase(),
      beneficiaryAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    });
    expect(lower).toContain(`OWNER: ${OWNER.address}`);
    expect(lower).toContain("BENEFICIARY-ADDRESS: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  });

  it("uses the en-dash placeholder when no beneficiary address is named", () => {
    expect(canonicalBitwillPayload(BASE)).toContain(
      `BENEFICIARY-ADDRESS: ${NO_BENEFICIARY_ADDRESS}`,
    );
  });

  it("commits the memo ONLY as its sha256 — the memo text never appears in the signed payload", () => {
    const payload = canonicalBitwillPayload(BASE);
    expect(payload).not.toContain(BASE.assetsMemo);
    expect(estateHash(BASE.assetsMemo)).toMatch(/^0x[0-9a-f]{64}$/);
    // deterministic + memo-sensitive
    expect(estateHash(BASE.assetsMemo)).toBe(estateHash(BASE.assetsMemo));
    expect(estateHash(BASE.assetsMemo)).not.toBe(estateHash(BASE.assetsMemo + "!"));
  });

  it("directiveHashOf is keccak256 of the payload bytes", () => {
    const payload = canonicalBitwillPayload(BASE);
    expect(directiveHashOf(payload)).toBe(keccak256(stringToBytes(payload)));
  });

  it("survives a real sign → recover round trip (EIP-191)", async () => {
    const payload = canonicalBitwillPayload(BASE);
    const signature = await OWNER.signMessage({ message: payload });
    const recovered = await recoverMessageAddress({ message: payload, signature });
    expect(recovered).toBe(OWNER.address);
    // a single changed field breaks recovery to the same address
    const tampered = canonicalBitwillPayload({ ...BASE, beneficiaryName: "Eve" });
    const recoveredTampered = await recoverMessageAddress({ message: tampered, signature });
    expect(recoveredTampered).not.toBe(OWNER.address);
  });
});
