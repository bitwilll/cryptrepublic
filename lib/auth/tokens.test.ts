// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generateSessionToken, hashToken } from "./tokens";

describe("session tokens", () => {
  it("generates 64-hex-char tokens that differ each call", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
  it("hashToken is deterministic sha256 hex", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe("abc");
  });
});
