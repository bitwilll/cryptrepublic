// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { importWallet, createWallet, isUnlocked, lock, revealMnemonic } from "./session";
import { mnemonicToSeed } from "./mnemonic";
import { deriveEvm, deriveSolana, deriveBitcoin } from "./derive";
import { hasVault, deleteVault } from "./storage";

/**
 * importWallet (Wave 11 A1): validate-first BIP-39 import that mirrors
 * createWallet byte-for-byte. Contract under test:
 *  - a valid phrase derives the KNOWN-VECTOR addresses and unlocks the vault
 *  - an INVALID phrase throws and writes NO vault (validate before derive)
 *  - pasted phrases with stray whitespace/case still import (normalization)
 *  - importing over an existing vault is an EXPLICIT overwrite, never silent
 */

// The all-zero 256-bit entropy vector (same as test/no-secret-to-fetch.test.ts).
const M =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon art";
const PASS = "fixed-passphrase-123";

beforeEach(async () => {
  lock();
  await deleteVault();
});

describe("importWallet", () => {
  it("imports a valid phrase → the known-vector addresses, unlocked, phrase round-trips", async () => {
    const seed = await mnemonicToSeed(M);
    const result = await importWallet(PASS, M);
    expect(result.accounts.evm).toBe(deriveEvm(seed).address);
    expect(result.accounts.solana).toBe(deriveSolana(seed).address);
    expect(result.accounts.bitcoin).toBe(deriveBitcoin(seed, "testnet").address);
    // No mnemonic in the result — the user already has it.
    expect("mnemonic" in result).toBe(false);
    expect(isUnlocked()).toBe(true);
    expect(await hasVault()).toBe(true);
    // The vault encrypts the SAME entropy: reveal round-trips to the phrase.
    expect(await revealMnemonic(PASS)).toBe(M);
  });

  it("throws on an invalid phrase and writes NO vault (validate before derive)", async () => {
    await expect(importWallet(PASS, "not a real recovery phrase at all")).rejects.toThrow(
      /invalid/i,
    );
    expect(await hasVault()).toBe(false);
    expect(isUnlocked()).toBe(false);
  });

  it("tolerates pasted whitespace + case (normalizes before validating)", async () => {
    const messy = "  " + M.toUpperCase().split(" ").join("   ") + " \n ";
    const seed = await mnemonicToSeed(M);
    const result = await importWallet(PASS, messy);
    expect(result.accounts.evm).toBe(deriveEvm(seed).address);
    expect(await revealMnemonic(PASS)).toBe(M);
  });

  it("refuses to overwrite an existing vault unless explicitly confirmed", async () => {
    await createWallet(PASS);
    await expect(importWallet(PASS, M)).rejects.toThrow(/already exists/i);
    // Confirmed overwrite REPLACES the vault with the imported one.
    const seed = await mnemonicToSeed(M);
    const result = await importWallet(PASS, M, "Primary", true);
    expect(result.accounts.evm).toBe(deriveEvm(seed).address);
    expect(await revealMnemonic(PASS)).toBe(M);
  });
});
