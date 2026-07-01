// @vitest-environment node
import { describe, it, expect } from "vitest";
import { receiveQrDataUrl } from "./receive";

describe("receiveQrDataUrl", () => {
  it("returns a PNG data URL for an address", async () => {
    const url = await receiveQrDataUrl("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(url.length).toBeGreaterThan(100);
  });
});
