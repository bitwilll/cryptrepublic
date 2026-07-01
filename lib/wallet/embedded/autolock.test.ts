// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createWallet, lock, isUnlocked, startAutoLock } from "./session";
import { deleteVault } from "./storage";

let teardown: (() => void) | undefined;

beforeEach(async () => {
  lock();
  await deleteVault();
});

afterEach(() => {
  teardown?.();
  teardown = undefined;
  vi.useRealTimers();
});

describe("auto-lock (jsdom)", () => {
  it("locks when the tab is hidden past the grace period", async () => {
    await createWallet("strong-passphrase-123");
    expect(isUnlocked()).toBe(true);

    vi.useFakeTimers();
    teardown = startAutoLock(600_000);

    // Simulate the tab going hidden.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(6_000); // past the 5s grace

    expect(isUnlocked()).toBe(false);
  });

  it("locks on inactivity timeout", async () => {
    await createWallet("strong-passphrase-123");
    vi.useFakeTimers();
    teardown = startAutoLock(1_000);
    vi.advanceTimersByTime(1_500);
    expect(isUnlocked()).toBe(false);
  });
});
