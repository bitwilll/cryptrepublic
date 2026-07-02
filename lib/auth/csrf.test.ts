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

  describe("www variant of the configured host (same-site, hit live on cryptrepublic.com)", () => {
    const withAppUrl = (url: string, fn: () => void) => {
      const prev = process.env.NEXT_PUBLIC_APP_URL;
      process.env.NEXT_PUBLIC_APP_URL = url;
      try {
        fn();
      } finally {
        if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
        else process.env.NEXT_PUBLIC_APP_URL = prev;
      }
    };
    const post = (origin: string) =>
      new Request("https://cryptrepublic.com/api/applications/attest", {
        method: "POST",
        headers: { origin },
      });

    it("accepts www.<host> when the apex is configured", () => {
      withAppUrl("https://cryptrepublic.com", () => {
        expect(isAllowedOrigin(post("https://www.cryptrepublic.com"))).toBe(true);
        expect(isAllowedOrigin(post("https://cryptrepublic.com"))).toBe(true);
      });
    });

    it("accepts the apex when www.<host> is configured", () => {
      withAppUrl("https://www.cryptrepublic.com", () => {
        expect(isAllowedOrigin(post("https://cryptrepublic.com"))).toBe(true);
        expect(isAllowedOrigin(post("https://www.cryptrepublic.com"))).toBe(true);
      });
    });

    it("still rejects near-miss and foreign hosts", () => {
      withAppUrl("https://cryptrepublic.com", () => {
        expect(isAllowedOrigin(post("https://wwwcryptrepublic.com"))).toBe(false); // no dot
        expect(isAllowedOrigin(post("https://www.evil.example"))).toBe(false);
        expect(isAllowedOrigin(post("https://cryptrepublic.com.evil.example"))).toBe(false);
        expect(isAllowedOrigin(post("https://sub.cryptrepublic.com"))).toBe(false); // only www, not any subdomain
      });
    });
  });
});
