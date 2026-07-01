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

export async function deriveKeyBytes(
  passphrase: string,
  salt: Uint8Array,
): Promise<DerivedKeyResult> {
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
  } catch {
    // Argon2id compiles WASM; a strict CSP (no 'wasm-unsafe-eval') throws a
    // WebAssembly CompileError. Any WASM/eval-blocked failure degrades to
    // PBKDF2 rather than propagating.
    const keyBytes = await pbkdf2Fallback(passphrase, salt);
    return { keyBytes, kdf: "pbkdf2" };
  }
}
