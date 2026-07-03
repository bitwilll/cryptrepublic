// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseListQuery } from "@/lib/admin/routeGuard";

/**
 * parseListQuery bounds (audit hardening): a huge `page` must be rejected as
 * invalid (→ 400) rather than flowing to Prisma as an out-of-range `skip`
 * (which would 500). pageSize stays 1..100; page stays 1..MAX_PAGE.
 */
const q = (s: string) => parseListQuery(new URL(`http://x/api/admin/users${s}`));

describe("parseListQuery", () => {
  it("defaults to page 1 / pageSize 20", () => {
    expect(q("")).toEqual({ page: 1, pageSize: 20 });
  });

  it("accepts valid bounded values", () => {
    expect(q("?page=3&pageSize=50")).toEqual({ page: 3, pageSize: 50 });
    expect(q("?page=1000000")).toEqual({ page: 1000000, pageSize: 20 }); // the ceiling itself is ok
  });

  it("rejects non-numeric / zero / oversized pageSize → null", () => {
    expect(q("?page=abc")).toBeNull();
    expect(q("?page=0")).toBeNull();
    expect(q("?pageSize=0")).toBeNull();
    expect(q("?pageSize=101")).toBeNull();
    expect(q("?page=-1")).toBeNull(); // '-1' fails the ^\d+$ guard
  });

  it("rejects a huge page that would overflow Prisma's skip → null (not a 500)", () => {
    expect(q("?page=99999999999999999999999999")).toBeNull();
    expect(q("?page=1000001")).toBeNull(); // just past MAX_PAGE
  });
});
