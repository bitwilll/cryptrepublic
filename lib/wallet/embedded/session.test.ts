// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { createWallet, unlock, lock, isUnlocked, getAccounts, revealMnemonic } from "./session";
import { deleteVault } from "./storage";
import { WalletUnlockError } from "./vault";

beforeEach(async () => {
  lock();
  await deleteVault();
});

describe("WalletSession", () => {
  it("create -> holds unlocked, exposes accounts, reveals same mnemonic", async () => {
    const { mnemonic, accounts } = await createWallet("strong-passphrase-123");
    expect(isUnlocked()).toBe(true);
    expect(accounts.evm).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(await revealMnemonic("strong-passphrase-123")).toBe(mnemonic);
  });

  it("lock drops the unlocked state; getAccounts still returns public addresses", async () => {
    const { accounts } = await createWallet("strong-passphrase-123");
    lock();
    expect(isUnlocked()).toBe(false);
    expect(getAccounts()?.evm).toBe(accounts.evm);
  });

  it("unlock with the right passphrase works; wrong throws WalletUnlockError", async () => {
    await createWallet("strong-passphrase-123");
    lock();
    await expect(unlock("wrong")).rejects.toBeInstanceOf(WalletUnlockError);
    expect(isUnlocked()).toBe(false);
    const a = await unlock("strong-passphrase-123");
    expect(isUnlocked()).toBe(true);
    expect(a.evm).toMatch(/^0x/);
  });
});
