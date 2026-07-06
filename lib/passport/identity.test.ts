// @vitest-environment node
import { describe, it, expect } from "vitest";
import { passportSeed, identicon, fingerprint } from "./identity";

describe("passport identity art", () => {
  it("passportSeed prefers the identity, falls back to a name-derived key", () => {
    expect(passportSeed("0xABC", "Nova")).toBe("0xABC");
    expect(passportSeed("  ", "Nova Applicant")).toBe("cr:nova applicant");
    expect(passportSeed(null, "")).toBe("cr:pending-citizen");
  });

  it("identicon is deterministic, symmetric, and on-brand", () => {
    const a = identicon("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    const b = identicon("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(a).toEqual(b); // stable per seed
    expect(a.size).toBe(7);
    expect(a.cells).toHaveLength(7);
    // Vertically mirrored across the centre column.
    for (const row of a.cells) {
      expect(row).toHaveLength(7);
      for (let x = 0; x < 3; x++) expect(row[x]).toBe(row[6 - x]);
    }
    expect(a.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("different seeds give different art", () => {
    const a = identicon("0xaaa");
    const b = identicon("0xbbb");
    expect(JSON.stringify(a.cells)).not.toBe(JSON.stringify(b.cells));
  });

  it("fingerprint is a stable 16-hex string per seed", () => {
    const f = fingerprint("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(f).toMatch(/^[0-9A-F]{16}$/);
    expect(fingerprint("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe(f);
    expect(fingerprint("0xother")).not.toBe(f);
  });
});
