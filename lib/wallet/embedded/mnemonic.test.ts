// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToEntropy,
  entropyToMnemonic,
} from "./mnemonic";

describe("mnemonic", () => {
  it("generates a valid 24-word phrase by default", () => {
    const m = generateMnemonic();
    expect(m.split(" ")).toHaveLength(24);
    expect(validateMnemonic(m)).toBe(true);
  });
  it("supports 12 words at 128-bit", () => {
    expect(generateMnemonic(128).split(" ")).toHaveLength(12);
  });
  it("rejects an invalid phrase", () => {
    expect(validateMnemonic("not a real mnemonic phrase at all zzz")).toBe(false);
  });
  it("round-trips a known BIP-39 vector (entropy <-> phrase)", () => {
    // BIP-39 test vector: all-zero 256-bit entropy -> "abandon...art"
    const phrase =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
      "abandon abandon abandon art";
    expect(entropyToMnemonic(new Uint8Array(32))).toBe(phrase);
    expect(Array.from(mnemonicToEntropy(phrase))).toEqual(Array.from(new Uint8Array(32)));
  });
});
