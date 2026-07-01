// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dividends read client tests. readEpoch maps the 5-tuple; readClaimable returns
 * the bigint (contract accrual). publicClientFor mocked. Fresh chain: currentEpoch 0.
 */

const DIST = "0x1111111111111111111111111111111111111111" as `0x${string}`;

const h = vi.hoisted(() => ({
  currentEpoch: 0n,
  epochTuple: [0n, 0n, 0n, 0n, false] as [bigint, bigint, bigint, bigint, boolean],
  claimable: 0n,
}));

vi.mock("@/config/contracts", () => ({
  distributorAddress: () => DIST,
}));

vi.mock("@/lib/wallet/services/evmClients", () => ({
  publicClientFor: () => ({
    async readContract({ functionName }: { functionName: string }) {
      switch (functionName) {
        case "currentEpoch":
          return h.currentEpoch;
        case "epochs":
          return h.epochTuple;
        case "claimable":
          return h.claimable;
        default:
          throw new Error(`unexpected read ${functionName}`);
      }
    },
    async getLogs() {
      return [];
    },
  }),
}));

import { readCurrentEpoch, readEpoch, readClaimable, readDividendHistory } from "./client";

beforeEach(() => {
  h.currentEpoch = 0n;
  h.epochTuple = [0n, 0n, 0n, 0n, false];
  h.claimable = 0n;
});

describe("readCurrentEpoch", () => {
  it("returns 0n on a fresh chain (no epoch open)", async () => {
    expect(await readCurrentEpoch(31337)).toBe(0n);
  });
});

describe("readEpoch", () => {
  it("maps the 5-tuple into EpochInfo", async () => {
    h.epochTuple = [1000n, 5n, 200n, 42n, true];
    const e = await readEpoch(31337, 1n);
    expect(e).toEqual({
      epochId: 1n,
      amount: 1000n,
      snapshotCitizens: 5n,
      perCitizen: 200n,
      openedAt: 42n,
      open: true,
    });
  });
});

describe("readClaimable", () => {
  it("returns the contract accrual as a bigint", async () => {
    h.claimable = 200n;
    expect(await readClaimable(31337, 1n, 9n)).toBe(200n);
  });
});

describe("readDividendHistory", () => {
  it("returns [] when there are no DividendClaimed logs", async () => {
    expect(await readDividendHistory(31337, 9n)).toEqual([]);
  });
});
