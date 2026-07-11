import { describe, it, expect } from "vitest";
import { coinToCents, centsToCoin, sumCoin } from "./amounts";

/**
 * Money math (Wave 16 invest). BigInt cents only — the suite pins the exact
 * cases where float math would drift (0.29, 1.15, long sums) and the upper
 * bound of the validated grammar (8 integer digits).
 */

describe("coinToCents", () => {
  it("converts the validated decimal-string grammar exactly", () => {
    expect(coinToCents("0.01")).toBe(1n);
    expect(coinToCents("9.5")).toBe(950n);
    expect(coinToCents("128")).toBe(12800n);
    expect(coinToCents("128.00")).toBe(12800n);
    expect(coinToCents("10000000")).toBe(1000000000n);
    expect(coinToCents("99999999.99")).toBe(9999999999n);
  });

  it("is immune to float rounding (0.29 * 100 === 28.999… in doubles)", () => {
    expect(coinToCents("0.29")).toBe(29n);
    expect(coinToCents("1.15")).toBe(115n);
    expect(coinToCents("2.675")).toBe(267n); // grammar caps at 2 dp; extra digits truncate, never round up
  });
});

describe("centsToCoin", () => {
  it("renders cents back to a padded decimal string", () => {
    expect(centsToCoin(0n)).toBe("0.00");
    expect(centsToCoin(1n)).toBe("0.01");
    expect(centsToCoin(950n)).toBe("9.50");
    expect(centsToCoin(1000000000n)).toBe("10000000.00");
  });

  it("round-trips with coinToCents", () => {
    for (const v of ["0.01", "9.50", "128.00", "10000000.00", "99999999.99"]) {
      expect(centsToCoin(coinToCents(v))).toBe(v);
    }
  });
});

describe("sumCoin", () => {
  it("sums exactly where float addition would drift", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in doubles.
    expect(sumCoin(["0.10", "0.20"])).toBe("0.30");
    expect(sumCoin(["0.29", "0.29", "0.29"])).toBe("0.87");
  });

  it("handles big values without precision loss", () => {
    // 1000 max-size pledges: far past Number.MAX_SAFE_INTEGER in cents terms
    // once multiplied out; BigInt keeps every digit.
    const coins = Array.from({ length: 1000 }, () => "10000000.00");
    expect(sumCoin(coins)).toBe("10000000000.00");
    expect(sumCoin(["99999999.99", "0.01"])).toBe("100000000.00");
  });

  it("returns 0.00 for an empty ledger", () => {
    expect(sumCoin([])).toBe("0.00");
  });
});
