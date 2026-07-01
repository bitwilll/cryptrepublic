// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  weiToEth,
  ethToWei,
  lamportsToSol,
  satsToBtc,
  isValidEvmAddress,
  toChecksumAddress,
  isValidSolanaAddress,
  isValidBtcAddress,
} from "./units";

describe("units", () => {
  it("converts eth <-> wei", () => {
    expect(ethToWei("1")).toBe(10n ** 18n);
    expect(weiToEth(10n ** 18n)).toBe("1");
    expect(ethToWei("0.5")).toBe(5n * 10n ** 17n);
  });
  it("converts lamports -> SOL and sats -> BTC", () => {
    expect(lamportsToSol(1_000_000_000n)).toBe("1");
    expect(satsToBtc(100_000_000n)).toBe("1");
    expect(satsToBtc(50_000_000n)).toBe("0.5");
  });
  it("validates + checksums EVM addresses", () => {
    expect(isValidEvmAddress("0x9858EfFD232B4033E47d90003D41EC34EcaEda94")).toBe(true);
    expect(isValidEvmAddress("0xnothex")).toBe(false);
    // known mixed-case checksum vector:
    expect(toChecksumAddress("0x9858effd232b4033e47d90003d41ec34ecaeda94")).toBe(
      "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
    );
  });
  it("validates Solana base58 addresses", () => {
    expect(isValidSolanaAddress("HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk")).toBe(true);
    expect(isValidSolanaAddress("not-base58-0OIl")).toBe(false);
    expect(isValidSolanaAddress("")).toBe(false);
  });
  it("validates BTC bech32 addresses (mainnet + testnet)", () => {
    expect(isValidBtcAddress("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu")).toBe(true);
    expect(isValidBtcAddress("tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0")).toBe(true);
    expect(isValidBtcAddress("0x9858EfFD232B4033E47d90003D41EC34EcaEda94")).toBe(false);
  });
});
