// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseTransaction } from "viem";
import { importWallet, lock } from "@/lib/wallet/embedded/session";
import { deleteVault } from "@/lib/wallet/embedded/storage";
import { signUnsignedEnvelope } from "./sign";
import type { UnsignedEnvelope } from "./codec";

/**
 * signUnsignedEnvelope (Wave 11 C5): the offline signer signs EXACTLY what
 * the envelope carries and NEVER touches the network — a fetch spy proves
 * zero calls; locked → throws (unlock-gated).
 */

const M =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon art";
const PASS = "fixed-passphrase-123";
const TO = "0x1111111111111111111111111111111111111111" as const;

const ENV: UnsignedEnvelope = {
  v: 1,
  t: "cr-eth-tx-unsigned",
  chainId: 84532,
  tx: {
    to: TO,
    value: 42n,
    nonce: 3,
    gas: 21000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 1_000_000n,
  },
};

let fetchSpy: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  lock();
  await deleteVault();
  fetchSpy = vi.fn(async () => new Response("{}"));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("signUnsignedEnvelope", () => {
  it("signs the envelope's exact params (parseTransaction round-trip) with ZERO network calls", async () => {
    await importWallet(PASS, M); // imports AND unlocks
    const signed = await signUnsignedEnvelope(ENV);
    expect(signed.t).toBe("cr-eth-tx-signed");
    const parsed = parseTransaction(signed.raw);
    expect(parsed.chainId).toBe(ENV.chainId);
    expect(parsed.nonce).toBe(ENV.tx.nonce);
    expect(parsed.to?.toLowerCase()).toBe(TO.toLowerCase());
    expect(parsed.value).toBe(42n);
    expect(parsed.gas).toBe(21000n);
    // The custody boundary in action: signing is a PURE local operation.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws when the wallet is locked (unlock-gated)", async () => {
    await importWallet(PASS, M);
    lock();
    await expect(signUnsignedEnvelope(ENV)).rejects.toThrow(/locked/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
