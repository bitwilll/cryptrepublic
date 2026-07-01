// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, __resetRateLimit } from "./ratelimit";

describe("in-memory sliding-window rate limit", () => {
  beforeEach(() => __resetRateLimit());
  it("allows up to the limit then blocks with a retry-after", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("ip:1", 3, 60_000).ok).toBe(true);
    const blocked = rateLimit("ip:1", 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
  it("isolates keys", () => {
    for (let i = 0; i < 3; i++) rateLimit("ip:a", 3, 60_000);
    expect(rateLimit("ip:b", 3, 60_000).ok).toBe(true);
  });
});
