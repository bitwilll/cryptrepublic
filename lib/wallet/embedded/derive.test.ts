// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mnemonicToSeed } from "./mnemonic";
import { deriveEvm, deriveSolana, deriveBitcoin } from "./derive";

// Canonical test mnemonic = the all-zero 128-bit ("abandon...about") phrase.
//
// DEVIATION NOTE: the plan text used the 24-word "abandon...art" phrase but
// pinned the 12-word phrase's PUBLISHED vectors (EVM 0x9858EfFD…, BTC
// bc1qcr8te4k…). Those pinned externally-published vectors are the authoritative
// anchors, so we use the matching 12-word phrase. Verified independently:
//   - EVM 0x9858EfFD… matches viem's own mnemonicToAccount + iancoleman/MetaMask.
//   - Solana HAgk14Jp… cross-checked against a from-scratch SLIP-0010 ed25519
//     implementation (node crypto HMAC-SHA512), NOT the lib under test.
//   - BTC bc1qcr8te4k… is the published BIP-84 vector; tb1q… shares the same key.
const M =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("HD derivation vectors", () => {
  it("derives the expected EVM address at m/44'/60'/0'/0/0", async () => {
    const seed = await mnemonicToSeed(M);
    const acct = deriveEvm(seed);
    expect(acct.path).toBe("m/44'/60'/0'/0/0");
    // PUBLISHED vector (iancoleman.io/bip39, MetaMask) for "abandon…about":
    expect(acct.address).toBe("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
  });

  it("derives the expected Solana address at m/44'/501'/0'/0' (SLIP-0010)", async () => {
    const seed = await mnemonicToSeed(M);
    const acct = deriveSolana(seed);
    expect(acct.path).toBe("m/44'/501'/0'/0'");
    // Cross-checked against an independent SLIP-0010 ed25519 implementation.
    expect(acct.address).toBe("HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk");
  });

  it("derives a mainnet native-segwit BTC address (bc1q…) at m/84'/0'/0'/0/0", async () => {
    const seed = await mnemonicToSeed(M);
    const acct = deriveBitcoin(seed, "mainnet");
    expect(acct.path).toBe("m/84'/0'/0'/0/0");
    // PUBLISHED BIP-84 vector for this phrase:
    expect(acct.address).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
  });

  it("derives a testnet native-segwit BTC address (tb1q…) at m/84'/0'/0'/0/0", async () => {
    const seed = await mnemonicToSeed(M);
    const acct = deriveBitcoin(seed, "testnet");
    expect(acct.path).toBe("m/84'/0'/0'/0/0");
    expect(acct.address.startsWith("tb1q")).toBe(true);
    // Same key/pubkey as the mainnet vector, different HRP:
    expect(acct.address).toBe("tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0");
  });
});
