import "client-only";
import { HDKey } from "@scure/bip32";
import { derivePath } from "ed25519-hd-key";
import * as btc from "@scure/btc-signer";
import { Keypair } from "@solana/web3.js";
import { bytesToHex, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * HD derivation (index 0) per chain from a BIP-39 seed. Each fn returns the
 * PUBLIC address + public key plus (via the signer factories) a short-lived
 * signer handle — never a persisted long-lived private key object.
 */

export interface DerivedAccount {
  address: string;
  publicKey: string;
}

export const EVM_PATH = "m/44'/60'/0'/0/0";
export const SOLANA_PATH = "m/44'/501'/0'/0'";
export const BTC_PATH = "m/84'/0'/0'/0/0";

function seedToHex(seed: Uint8Array): string {
  return bytesToHex(seed).slice(2); // ed25519-hd-key wants a hex string (no 0x)
}

/** EVM (secp256k1), m/44'/60'/0'/0/0 — shared by all five EVM chains. */
export function deriveEvm(seed: Uint8Array): DerivedAccount & { path: string } {
  const hd = HDKey.fromMasterSeed(seed).derive(EVM_PATH);
  if (!hd.privateKey) throw new Error("Failed to derive EVM private key.");
  const account = privateKeyToAccount(bytesToHex(hd.privateKey));
  return { address: account.address, publicKey: account.publicKey, path: EVM_PATH };
}

/** Solana (ed25519, SLIP-0010 all-hardened), m/44'/501'/0'/0'. */
export function deriveSolana(seed: Uint8Array): DerivedAccount & { path: string } {
  const { key } = derivePath(SOLANA_PATH, seedToHex(seed));
  const kp = Keypair.fromSeed(key.slice(0, 32));
  const address = kp.publicKey.toBase58();
  return { address, publicKey: address, path: SOLANA_PATH };
}

/**
 * Bitcoin native segwit (bech32), m/84'/0'/0'/0/0. NETWORK-EXPLICIT:
 * mainnet -> bc1q…, testnet -> tb1q…. The caller passes
 * `activeChain().bitcoinNetwork`.
 */
export function deriveBitcoin(
  seed: Uint8Array,
  network: "mainnet" | "testnet",
): DerivedAccount & { path: string } {
  const hd = HDKey.fromMasterSeed(seed).derive(BTC_PATH);
  if (!hd.publicKey) throw new Error("Failed to derive BTC public key.");
  const net = network === "mainnet" ? btc.NETWORK : btc.TEST_NETWORK;
  const p2 = btc.p2wpkh(hd.publicKey, net);
  if (!p2.address) throw new Error("Failed to derive BTC address.");
  return { address: p2.address, publicKey: bytesToHex(hd.publicKey), path: BTC_PATH };
}

// --- Transient signer factories (produced on demand; never persisted) ---

/** A viem local Account for the EVM key. Zeroize the seed after use upstream. */
export function evmSigner(seed: Uint8Array): Account {
  const hd = HDKey.fromMasterSeed(seed).derive(EVM_PATH);
  if (!hd.privateKey) throw new Error("Failed to derive EVM private key.");
  return privateKeyToAccount(bytesToHex(hd.privateKey));
}

/** The raw EVM private key hex (transient — caller must zeroize/limit lifetime). */
export function evmPrivateKeyHex(seed: Uint8Array): `0x${string}` {
  const hd = HDKey.fromMasterSeed(seed).derive(EVM_PATH);
  if (!hd.privateKey) throw new Error("Failed to derive EVM private key.");
  return bytesToHex(hd.privateKey);
}

/** A Solana ed25519 Keypair (transient). */
export function solanaKeypair(seed: Uint8Array): Keypair {
  const { key } = derivePath(SOLANA_PATH, seedToHex(seed));
  return Keypair.fromSeed(key.slice(0, 32));
}
