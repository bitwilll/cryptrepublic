// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { saveVault, loadVault, hasVault, deleteVault } from "./storage";
import type { VaultBlob } from "./vault";

const BLOB: VaultBlob = {
  v: 1,
  kdf: "argon2id",
  kdfParams: { memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32 },
  cipher: "AES-256-GCM",
  salt: "c2FsdA==",
  iv: "aXY=",
  ct: "Y3Q=",
  addresses: { evm: "0xabc", solana: "So1", bitcoin: "bc1q" },
  createdAt: "2026-07-01T00:00:00.000Z",
  label: "Primary",
};

beforeEach(async () => {
  await deleteVault();
});

describe("vault storage (IndexedDB)", () => {
  it("saves and loads the same blob", async () => {
    await saveVault(BLOB);
    const back = await loadVault();
    expect(back).toEqual(BLOB);
  });

  it("hasVault reflects presence; deleteVault removes it", async () => {
    expect(await hasVault()).toBe(false);
    await saveVault(BLOB);
    expect(await hasVault()).toBe(true);
    await deleteVault();
    expect(await hasVault()).toBe(false);
    expect(await loadVault()).toBeUndefined();
  });
});
