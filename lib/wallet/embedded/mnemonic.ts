import "client-only";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/**
 * BIP-39 mnemonic generation and validation (English wordlist).
 *
 * Entropy is sourced from `crypto.getRandomValues` ONLY (never `Math.random`,
 * timestamps, or user input): `@scure/bip39.generateMnemonic` uses the platform
 * CSPRNG internally. The vault encrypts the ENTROPY (not the phrase) so a reveal
 * reproduces the exact words.
 */

export type MnemonicStrength = 128 | 160 | 192 | 224 | 256;

export function generateMnemonic(strength: MnemonicStrength = 256): string {
  return bip39.generateMnemonic(wordlist, strength);
}

export function validateMnemonic(phrase: string): boolean {
  return bip39.validateMnemonic(phrase, wordlist);
}

export function mnemonicToEntropy(phrase: string): Uint8Array {
  return bip39.mnemonicToEntropy(phrase, wordlist);
}

export function entropyToMnemonic(entropy: Uint8Array): string {
  return bip39.entropyToMnemonic(entropy, wordlist);
}

/** The optional 25th-word passphrase is reserved (not surfaced in v1 UI). */
export function mnemonicToSeed(phrase: string, passphrase?: string): Promise<Uint8Array> {
  return bip39.mnemonicToSeed(phrase, passphrase);
}
