import { describe, it, expect } from "vitest";
import { formatCoin, categoryLabel, formatDate } from "./format";
import { nextListingStatus } from "./transitions";

describe("formatCoin", () => {
  it("pads to 2 dp and groups thousands in the official mono format", () => {
    expect(formatCoin("128.00")).toBe("₡ 128.00 CRPT");
    expect(formatCoin("128")).toBe("₡ 128.00 CRPT");
    expect(formatCoin("9.5")).toBe("₡ 9.50 CRPT");
    expect(formatCoin("0.01")).toBe("₡ 0.01 CRPT");
    expect(formatCoin("10000000")).toBe("₡ 10,000,000.00 CRPT");
  });
});

describe("categoryLabel", () => {
  it("maps the union to sentence-case labels and passes unknowns through", () => {
    expect(categoryLabel("GOODS")).toBe("Goods");
    expect(categoryLabel("SERVICES")).toBe("Services");
    expect(categoryLabel("COLLECTIBLES")).toBe("Collectibles");
    expect(categoryLabel("OTHER")).toBe("Other");
    expect(categoryLabel("X")).toBe("X");
  });
});

describe("formatDate", () => {
  it("renders a compact date and dashes on garbage", () => {
    expect(formatDate("2026-07-07T10:00:00.000Z")).toMatch(/07 Jul 2026/);
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("nextListingStatus", () => {
  it("permits exactly the three legal transitions", () => {
    expect(nextListingStatus("ACTIVE", "withdraw")).toBe("WITHDRAWN");
    expect(nextListingStatus("ACTIVE", "mark-sold")).toBe("SOLD");
    expect(nextListingStatus("WITHDRAWN", "relist")).toBe("ACTIVE");
  });
  it("rejects everything else, incl. anything from SOLD or REMOVED", () => {
    expect(nextListingStatus("ACTIVE", "relist")).toBeNull();
    expect(nextListingStatus("WITHDRAWN", "withdraw")).toBeNull();
    expect(nextListingStatus("WITHDRAWN", "mark-sold")).toBeNull();
    for (const action of ["withdraw", "mark-sold", "relist"] as const) {
      expect(nextListingStatus("SOLD", action)).toBeNull();
      expect(nextListingStatus("REMOVED", action)).toBeNull();
    }
  });
});
