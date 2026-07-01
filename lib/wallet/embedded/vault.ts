import "client-only";
import { deriveKeyBytes, ARGON2_PARAMS, type KdfParams } from "./kdf";

/**
 * The vault: AES-256-GCM encryption of the BIP-39 ENTROPY under a KDF-derived
 * key. A fresh 12-byte IV is minted on EVERY encryption (GCM nonce reuse under
 * one key is catastrophic). The AAD binds the header (version + kdf + kdfParams)
 * to the ciphertext and is RECONSTRUCTED FROM THE BLOB on decrypt (so a PBKDF2
 * fallback vault, which stores kdf:"pbkdf2", passes its own auth tag). Wrong
 * passphrase fails the GCM tag -> WalletUnlockError, and never returns plaintext.
 */

export class WalletUnlockError extends Error {
  constructor(message = "incorrect passphrase") {
    super(message);
    this.name = "WalletUnlockError";
  }
}

export interface VaultBlob {
  v: 1;
  kdf: "argon2id" | "pbkdf2";
  kdfParams: KdfParams;
  cipher: "AES-256-GCM";
  salt: string; // base64, 16 bytes
  iv: string; // base64, 12 bytes
  ct: string; // base64, ciphertext incl. 16-byte GCM tag
  addresses: { evm: string; solana: string; bitcoin: string };
  createdAt: string;
  label: string;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function aadFor(v: 1, kdf: VaultBlob["kdf"], kdfParams: KdfParams): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v, kdf, kdfParams }));
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    "AES-GCM",
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
}

export async function encryptEntropy(
  entropy: Uint8Array,
  passphrase: string,
  addresses: VaultBlob["addresses"],
  label = "Primary",
): Promise<VaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12)); // FRESH every encrypt
  const { keyBytes, kdf } = await deriveKeyBytes(passphrase, salt);
  const key = await importAesKey(keyBytes);
  keyBytes.fill(0); // best-effort zeroize the raw key material after import

  const aad = aadFor(1, kdf, ARGON2_PARAMS);
  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as unknown as BufferSource,
      additionalData: aad as unknown as BufferSource,
    },
    key,
    entropy as unknown as BufferSource,
  );

  return {
    v: 1,
    kdf,
    kdfParams: ARGON2_PARAMS,
    cipher: "AES-256-GCM",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
    addresses,
    createdAt: new Date().toISOString(),
    label,
  };
}

export async function decryptEntropy(blob: VaultBlob, passphrase: string): Promise<Uint8Array> {
  const salt = fromBase64(blob.salt);
  const iv = fromBase64(blob.iv);
  const ct = fromBase64(blob.ct);
  // Derive with the vault's RECORDED kdf (not "try argon2 first") so a PBKDF2
  // vault unlocks even where Argon2id is now available.
  const { keyBytes } = await deriveKeyBytes(passphrase, salt, blob.kdf);
  const key = await importAesKey(keyBytes);
  keyBytes.fill(0);

  // Reconstruct AAD from the BLOB's stored fields (NOT a hardcoded constant),
  // so a pbkdf2 fallback vault authenticates correctly.
  const aad = aadFor(blob.v, blob.kdf, blob.kdfParams);
  try {
    const pt = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv as unknown as BufferSource,
        additionalData: aad as unknown as BufferSource,
      },
      key,
      ct as unknown as BufferSource,
    );
    return new Uint8Array(pt);
  } catch {
    // Wrong passphrase (or tampering) fails the GCM auth tag. No oracle beyond
    // pass/fail; never surface partial plaintext.
    throw new WalletUnlockError();
  }
}
