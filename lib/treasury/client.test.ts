// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { zeroAddress } from "viem";

/**
 * Treasury read client tests. readTreasuryReserves reads balanceOf(crypt) +
 * balanceOf(0x0); honest near-0 on a fresh chain. publicClientFor mocked.
 */

const TREASURY = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const TOKEN = "0x2222222222222222222222222222222222222222" as `0x${string}`;

const h = vi.hoisted(() => ({
  cryptWei: 0n,
  ethWei: 0n,
  lastBalanceArgs: [] as `0x${string}`[],
}));

vi.mock("@/config/contracts", () => ({
  treasuryAddress: () => TREASURY,
  contractEntry: () => ({ token: TOKEN, treasury: TREASURY }),
}));

vi.mock("@/lib/wallet/services/evmClients", () => ({
  publicClientFor: () => ({
    async readContract({ functionName, args }: { functionName: string; args: unknown[] }) {
      if (functionName === "balanceOf") {
        const token = args[0] as `0x${string}`;
        h.lastBalanceArgs.push(token);
        return token === TOKEN ? h.cryptWei : h.ethWei;
      }
      throw new Error(`unexpected read ${functionName}`);
    },
    async getLogs() {
      return [];
    },
  }),
}));

import { readTreasuryReserves, readDisbursements } from "./client";

beforeEach(() => {
  h.cryptWei = 0n;
  h.ethWei = 0n;
  h.lastBalanceArgs = [];
});

describe("readTreasuryReserves", () => {
  it("reads balanceOf(crypt) + balanceOf(0x0)", async () => {
    h.cryptWei = 1234n;
    h.ethWei = 56n;
    const r = await readTreasuryReserves(31337);
    expect(r.cryptWei).toBe(1234n);
    expect(r.ethWei).toBe(56n);
    expect(h.lastBalanceArgs).toContain(TOKEN);
    expect(h.lastBalanceArgs).toContain(zeroAddress);
  });

  it("is honest near-zero on a fresh chain", async () => {
    const r = await readTreasuryReserves(31337);
    expect(r.cryptWei).toBe(0n);
    expect(r.ethWei).toBe(0n);
  });
});

describe("readDisbursements", () => {
  it("returns [] when there are no Disbursed logs", async () => {
    expect(await readDisbursements(31337)).toEqual([]);
  });
});
