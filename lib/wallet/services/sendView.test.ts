// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAddress } from "viem";
import type { SendPreview } from "./send";

/**
 * Send-confirm view model tests. `evmEntry` (chain name + native currency) and
 * `tokensForChain` / `contractEntry` (token metadata) are mocked so the VM's
 * formatting + the $CRYPT union resolution are exercised without a live chain.
 *
 * ROOT-CAUSE regression guard (findings #1/#2/#7): $CRYPT lives in
 * contractEntry(chainId).token, NOT tokensForChain — sendableTokens must union
 * them so $CRYPT SEND resolves.
 */

const h = vi.hoisted(() => ({
  cryptToken: undefined as `0x${string}` | undefined,
}));

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;
const CRYPT = "0x3333333333333333333333333333333333333333" as `0x${string}`;
const TO = "0x1111111111111111111111111111111111111111" as `0x${string}`;

vi.mock("@/config/tokens", () => ({
  tokensForChain: () => [
    { symbol: "CRYPT", decimals: 18, address: undefined }, // address-less placeholder
    { symbol: "WETH", decimals: 18, address: "0x4200000000000000000000000000000000000006" },
    { symbol: "USDC", decimals: 6, address: USDC },
  ],
}));

vi.mock("@/config/contracts", () => ({
  contractEntry: () => (h.cryptToken ? { token: h.cryptToken } : {}),
}));

vi.mock("@/config/chains.config", () => ({
  evmEntry: (chainId: number) => ({
    chainId,
    viemChain: {
      name: "Base Sepolia",
      nativeCurrency: { symbol: "ETH", decimals: 18, name: "Ether" },
    },
  }),
}));

import { sendableTokens, toSendConfirmVM } from "./sendView";

beforeEach(() => {
  h.cryptToken = undefined;
});

describe("sendableTokens", () => {
  it("drops the address-less CRYPT placeholder and keeps resolvable tokens", () => {
    const toks = sendableTokens(84532);
    expect(toks.every((t) => t.address !== undefined)).toBe(true);
    expect(toks.find((t) => t.symbol === "WETH")).toBeDefined();
    expect(toks.find((t) => t.symbol === "USDC")).toBeDefined();
  });

  it("appends $CRYPT (from contractEntry.token) when registered — deduped", () => {
    h.cryptToken = CRYPT;
    const toks = sendableTokens(84532);
    const crypts = toks.filter((t) => t.symbol === "CRYPT");
    expect(crypts).toHaveLength(1);
    expect(crypts[0].address?.toLowerCase()).toBe(CRYPT.toLowerCase());
    expect(crypts[0].decimals).toBe(18);
  });

  it("omits $CRYPT (no throw) when contractEntry.token is unregistered", () => {
    h.cryptToken = undefined;
    const toks = sendableTokens(84532);
    expect(toks.find((t) => t.symbol === "CRYPT")).toBeUndefined();
  });
});

describe("toSendConfirmVM", () => {
  it("formats a NATIVE send with human units + native symbol", () => {
    const preview: SendPreview = {
      to: TO,
      amount: "1000000000000000000",
      token: "native",
      chainId: 84532,
      feeEstimate: "210000000000000",
    };
    const vm = toSendConfirmVM(preview);
    expect(vm.amountDisplay).toBe("1");
    expect(vm.tokenSymbol).toBe("ETH");
    expect(vm.feeSymbol).toBe("ETH");
    expect(vm.feeDisplay).toBe("0.00021");
    expect(vm.chainName).toBe("Base Sepolia");
    expect(vm.to).toBe(getAddress(TO));
  });

  it("formats a USDC send (6 decimals) with the token symbol", () => {
    const preview: SendPreview = {
      to: TO,
      amount: "1000000",
      token: USDC,
      chainId: 84532,
      feeEstimate: "210000000000000",
    };
    const vm = toSendConfirmVM(preview);
    expect(vm.amountDisplay).toBe("1");
    expect(vm.tokenSymbol).toBe("USDC");
  });

  it("resolves $CRYPT (from contractEntry.token) and does NOT throw — findings #1/#7", () => {
    h.cryptToken = CRYPT;
    const preview: SendPreview = {
      to: TO,
      amount: "5000000000000000000",
      token: CRYPT,
      chainId: 84532,
      feeEstimate: "210000000000000",
    };
    const vm = toSendConfirmVM(preview);
    expect(vm.tokenSymbol).toBe("CRYPT");
    expect(vm.amountDisplay).toBe("5");
  });

  it("throws for an unregistered $CRYPT token address", () => {
    h.cryptToken = undefined; // CRYPT not in the union
    const preview: SendPreview = {
      to: TO,
      amount: "1",
      token: CRYPT,
      chainId: 84532,
      feeEstimate: "0",
    };
    expect(() => toSendConfirmVM(preview)).toThrow(/token/i);
  });

  it("throws on an invalid recipient (checksum guard)", () => {
    const preview: SendPreview = {
      to: "0xnot-an-address",
      amount: "1",
      token: "native",
      chainId: 84532,
      feeEstimate: "0",
    };
    expect(() => toSendConfirmVM(preview)).toThrow();
  });
});
