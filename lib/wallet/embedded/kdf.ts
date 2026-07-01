import "client-only";
import { argon2id } from "hash-wasm";

/**
 * Key-derivation for the vault. Primary = Argon2id (memory-hard, via hash-wasm
 * WASM). Fallback = PBKDF2-SHA512(600k) via WebCrypto — used when the WASM can't
 * load (e.g. a strict CSP without `wasm-unsafe-eval` throws a WebAssembly
 * CompileError). The fallback records `kdf:"pbkdf2"` so decrypt reconstructs the
 * matching AAD. A CSP hiccup DEGRADES the KDF instead of bricking wallet
 * creation.
 */

export interface KdfParams {
  memorySize: 65536;
  iterations: 3;
  parallelism: 1;
  hashLength: 32;
}

export const ARGON2_PARAMS: KdfParams = {
  memorySize: 65536, // KiB = 64 MiB
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

export const PBKDF2_ITERATIONS = 600000 as const;

export type KdfKind = "argon2id" | "pbkdf2";

export interface DerivedKeyResult {
  keyBytes: Uint8Array;
  kdf: KdfKind;
}

async function pbkdf2Fallback(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-512",
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
    },
    baseKey,
    ARGON2_PARAMS.hashLength * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Derive the 32-byte vault key.
 * - ENCRYPT (no `forceKdf`): try Argon2id, degrade to PBKDF2 on a WASM/CSP failure.
 * - DECRYPT (`forceKdf` = the blob's stored `kdf`): derive with EXACTLY that KDF.
 *   Critical: a PBKDF2 vault (created when WASM was blocked) must still unlock even
 *   if Argon2id later becomes available — otherwise the mismatched key fails the
 *   GCM tag and reports a false "wrong passphrase", locking the user out of funds.
 */
export async function deriveKeyBytes(
  passphrase: string,
  salt: Uint8Array,
  forceKdf?: KdfKind,
): Promise<DerivedKeyResult> {
  if (forceKdf === "pbkdf2") {
    return { keyBytes: await pbkdf2Fallback(passphrase, salt), kdf: "pbkdf2" };
  }
  try {
    const keyBytes = await argon2id({
      password: passphrase,
      salt,
      parallelism: ARGON2_PARAMS.parallelism,
      iterations: ARGON2_PARAMS.iterations,
      memorySize: ARGON2_PARAMS.memorySize,
      hashLength: ARGON2_PARAMS.hashLength,
      outputType: "binary",
    });
    return { keyBytes, kdf: "argon2id" };
  } catch (err) {
    // A vault that REQUIRES argon2id cannot be unlocked without the WASM — surface it.
    if (forceKdf === "argon2id") throw err;
    // Encrypt path: a strict CSP (no 'wasm-unsafe-eval') throws a WebAssembly
    // CompileError; degrade to PBKDF2 rather than propagating.
    const keyBytes = await pbkdf2Fallback(passphrase, salt);
    return { keyBytes, kdf: "pbkdf2" };
  }
}
