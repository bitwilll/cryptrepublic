// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { encryptEntropy, decryptEntropy, WalletUnlockError } from "./vault";
import { generateMnemonic, mnemonicToEntropy, entropyToMnemonic } from "./mnemonic";

const ADDR = {
  evm: "0x0000000000000000000000000000000000000000",
  solana: "So1111",
  bitcoin: "bc1qx",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("vault", () => {
  it("round-trips: decrypt recovers the identical entropy/mnemonic", async () => {
    const m = generateMnemonic();
    const entropy = mnemonicToEntropy(m);
    const blob = await encryptEntropy(entropy, "correct horse battery staple", ADDR);
    const back = await decryptEntropy(blob, "correct horse battery staple");
    expect(entropyToMnemonic(back)).toBe(m);
  });

  it("WRONG passphrase throws WalletUnlockError and NEVER returns plaintext", async () => {
    const entropy = mnemonicToEntropy(generateMnemonic());
    const blob = await encryptEntropy(entropy, "right-passphrase-123", ADDR);
    await expect(decryptEntropy(blob, "wrong-passphrase-123")).rejects.toBeInstanceOf(
      WalletUnlockError,
    );
  });

  it("uses a FRESH IV per encryption (non-deterministic ciphertext)", async () => {
    const entropy = mnemonicToEntropy(generateMnemonic());
    const a = await encryptEntropy(entropy, "pw", ADDR);
    const b = await encryptEntropy(entropy, "pw", ADDR);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("persists a versioned blob with pinned KDF params and public addresses outside ct", async () => {
    const blob = await encryptEntropy(mnemonicToEntropy(generateMnemonic()), "pw", ADDR);
    expect(blob.v).toBe(1);
    expect(blob.cipher).toBe("AES-256-GCM");
    expect(blob.kdfParams).toEqual({
      memorySize: 65536,
      iterations: 3,
      parallelism: 1,
      hashLength: 32,
    });
    expect(blob.addresses).toEqual(ADDR);
    expect(blob.kdf).toBe("argon2id");
  });

  it("PBKDF2 FALLBACK round-trips (AAD reconstructed from blob.kdf) when WASM is unavailable", async () => {
    vi.resetModules();
    vi.doMock("hash-wasm", () => ({
      argon2id: vi.fn(async () => {
        throw new WebAssembly.CompileError("WASM blocked");
      }),
    }));
    const { encryptEntropy: enc, decryptEntropy: dec } = await import("./vault");
    const { mnemonicToEntropy: toEntropy, generateMnemonic: gen } = await import("./mnemonic");
    const entropy = toEntropy(gen());
    const blob = await enc(entropy, "pw-fallback-123", ADDR);
    expect(blob.kdf).toBe("pbkdf2");
    const back = await dec(blob, "pw-fallback-123");
    expect(Array.from(back)).toEqual(Array.from(entropy));
    vi.doUnmock("hash-wasm");
  });
});
