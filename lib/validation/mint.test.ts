// @vitest-environment node
import { describe, it, expect } from "vitest";
import { attestSchema, oathSchema, witnessSubmitSchema, sealConfirmSchema } from "./mint";

const ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BYTES32 = "0x" + "ab".repeat(32);
const SIG = "0x" + "cd".repeat(65);

describe("attestSchema", () => {
  it("accepts a valid attestation", () => {
    expect(
      attestSchema.safeParse({
        name: "A. Nakadai",
        domicileCity: "Lisbon",
        hostCountry: "Portugal",
      }).success,
    ).toBe(true);
  });
  it("rejects empty name and >64", () => {
    expect(attestSchema.safeParse({ name: "", domicileCity: "L", hostCountry: "P" }).success).toBe(
      false,
    );
    expect(
      attestSchema.safeParse({ name: "x".repeat(65), domicileCity: "L", hostCountry: "P" }).success,
    ).toBe(false);
  });
  it("rejects unknown keys (strict)", () => {
    expect(
      attestSchema.safeParse({
        name: "A",
        domicileCity: "L",
        hostCountry: "P",
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe("oathSchema", () => {
  it("accepts motto >= 5 and oathAccepted true", () => {
    expect(oathSchema.safeParse({ motto: "Recognized in time.", oathAccepted: true }).success).toBe(
      true,
    );
  });
  it("rejects oathAccepted false", () => {
    expect(oathSchema.safeParse({ motto: "Hello there", oathAccepted: false }).success).toBe(false);
  });
  it("rejects motto < 5", () => {
    expect(oathSchema.safeParse({ motto: "abc", oathAccepted: true }).success).toBe(false);
  });
});

describe("witnessSubmitSchema", () => {
  const good = {
    attestation: { applicant: ADDR, nameHash: BYTES32, nonce: "3", deadline: "1800000000" },
    signature: SIG,
  };
  it("accepts a well-formed witness submission", () => {
    expect(witnessSubmitSchema.safeParse(good).success).toBe(true);
  });
  it("rejects a bad applicant address", () => {
    expect(
      witnessSubmitSchema.safeParse({
        ...good,
        attestation: { ...good.attestation, applicant: "0x123" },
      }).success,
    ).toBe(false);
  });
  it("rejects a non-66-char nameHash", () => {
    expect(
      witnessSubmitSchema.safeParse({
        ...good,
        attestation: { ...good.attestation, nameHash: "0xabcd" },
      }).success,
    ).toBe(false);
  });
  it("rejects a non-numeric nonce", () => {
    expect(
      witnessSubmitSchema.safeParse({
        ...good,
        attestation: { ...good.attestation, nonce: "abc" },
      }).success,
    ).toBe(false);
  });
});

describe("sealConfirmSchema", () => {
  it("accepts a 0x64 txHash + numeric tokenId", () => {
    expect(sealConfirmSchema.safeParse({ txHash: BYTES32, tokenId: "5" }).success).toBe(true);
  });
  it("rejects a non-hex txHash", () => {
    expect(sealConfirmSchema.safeParse({ txHash: "nothex", tokenId: "5" }).success).toBe(false);
  });
  it("rejects a non-numeric tokenId", () => {
    expect(sealConfirmSchema.safeParse({ txHash: BYTES32, tokenId: "abc" }).success).toBe(false);
  });
});
