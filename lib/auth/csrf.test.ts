// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isAllowedOrigin } from "./csrf";

const APP = "http://localhost:3000";
describe("csrf origin allowlist", () => {
  it("accepts a matching Origin", () => {
    const req = new Request(APP + "/api/auth/login", {
      method: "POST",
      headers: { origin: APP },
    });
    expect(isAllowedOrigin(req)).toBe(true);
  });
  it("rejects a foreign Origin", () => {
    const req = new Request(APP + "/api/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(isAllowedOrigin(req)).toBe(false);
  });
  it("falls back to Referer host when Origin absent", () => {
    const good = new Request(APP + "/api/auth/login", {
      method: "POST",
      headers: { referer: APP + "/auth" },
    });
    expect(isAllowedOrigin(good)).toBe(true);
    const bad = new Request(APP + "/api/auth/login", {
      method: "POST",
      headers: { referer: "https://evil.example/x" },
    });
    expect(isAllowedOrigin(bad)).toBe(false);
  });
  it("rejects when neither header present", () => {
    const req = new Request(APP + "/api/auth/login", { method: "POST" });
    expect(isAllowedOrigin(req)).toBe(false);
  });
});
