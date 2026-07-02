// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { getWalletMode, setWalletMode, clearWalletMode, hasWalletMode } from "./mode";
import { saveVault, hasVault, deleteVault } from "./embedded/storage";
import type { VaultBlob } from "./embedded/vault";

/**
 * Wallet mode persistence (Wave 11 A2): a `meta` store in the SAME IndexedDB
 * as the vault (one openDB upgrade path — DB_VERSION 2). Default is embedded
 * (backwards-compatible: existing vault users land straight in embedded);
 * setting a mode NEVER disturbs the vault store.
 */

const WATCH = "0x1111111111111111111111111111111111111111" as const;

beforeEach(async () => {
  await clearWalletMode();
  await deleteVault();
});

describe("wallet mode store", () => {
  it("defaults to embedded when nothing is persisted", async () => {
    expect(await getWalletMode()).toEqual({ mode: "embedded" });
    expect(await hasWalletMode()).toBe(false);
  });

  it("round-trips a persisted mode incl. the watch-only address", async () => {
    await setWalletMode({ mode: "watchonly", watchAddress: WATCH });
    expect(await getWalletMode()).toEqual({ mode: "watchonly", watchAddress: WATCH });
    expect(await hasWalletMode()).toBe(true);
  });

  it("clearWalletMode returns to the default (back to the chooser)", async () => {
    await setWalletMode({ mode: "hardware" });
    await clearWalletMode();
    expect(await getWalletMode()).toEqual({ mode: "embedded" });
    expect(await hasWalletMode()).toBe(false);
  });

  it("setting a mode does NOT disturb an existing vault (separate store, same DB)", async () => {
    const blob = {
      v: 1,
      ciphertext: "00",
      iv: "00",
      kdf: "argon2id",
      kdfParams: {},
      addresses: { evm: "0x0", solana: "s", bitcoin: "b" },
      label: "Primary",
    } as unknown as VaultBlob;
    await saveVault(blob);
    await setWalletMode({ mode: "hardware" });
    expect(await hasVault()).toBe(true);
    expect((await getWalletMode()).mode).toBe("hardware");
  });
});
