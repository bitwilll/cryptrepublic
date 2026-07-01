// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { ARGON2_PARAMS, deriveKeyBytes, PBKDF2_ITERATIONS } from "./kdf";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("kdf", () => {
  it("pins the Argon2id params", () => {
    expect(ARGON2_PARAMS).toEqual({
      memorySize: 65536,
      iterations: 3,
      parallelism: 1,
      hashLength: 32,
    });
    expect(PBKDF2_ITERATIONS).toBe(600000);
  });

  it("derives a 32-byte key via argon2id (deterministic for same pw+salt)", async () => {
    const salt = new Uint8Array(16).fill(7);
    const a = await deriveKeyBytes("pw", salt);
    const b = await deriveKeyBytes("pw", salt);
    expect(a.kdf).toBe("argon2id");
    expect(a.keyBytes).toHaveLength(32);
    expect(Array.from(a.keyBytes)).toEqual(Array.from(b.keyBytes));
  });

  it("different salt -> different key", async () => {
    const a = await deriveKeyBytes("pw", new Uint8Array(16).fill(1));
    const b = await deriveKeyBytes("pw", new Uint8Array(16).fill(2));
    expect(Array.from(a.keyBytes)).not.toEqual(Array.from(b.keyBytes));
  });

  it("falls back to PBKDF2 when the WASM argon2id throws", async () => {
    vi.resetModules();
    vi.doMock("hash-wasm", () => ({
      argon2id: vi.fn(async () => {
        throw new WebAssembly.CompileError("WASM blocked by CSP");
      }),
    }));
    const { deriveKeyBytes: derive } = await import("./kdf");
    const res = await derive("pw", new Uint8Array(16).fill(3));
    expect(res.kdf).toBe("pbkdf2");
    expect(res.keyBytes).toHaveLength(32);
    vi.doUnmock("hash-wasm");
  });

  it("forceKdf='pbkdf2' uses PBKDF2 even when argon2id is available (decrypt path)", async () => {
    const salt = new Uint8Array(16).fill(9);
    const forced = await deriveKeyBytes("pw", salt, "pbkdf2");
    const auto = await deriveKeyBytes("pw", salt); // argon2id available in Node
    expect(forced.kdf).toBe("pbkdf2");
    expect(auto.kdf).toBe("argon2id");
    // argon2 and pbkdf2 produce DIFFERENT keys, so decrypt MUST derive by the
    // vault's stored kdf or it fails the GCM tag as a false wrong-passphrase.
    expect(Array.from(forced.keyBytes)).not.toEqual(Array.from(auto.keyBytes));
    expect(forced.keyBytes).toHaveLength(32);
  });
});
