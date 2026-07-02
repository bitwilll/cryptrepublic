// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

const KEY = `test_public_flag_${Date.now()}`;
const APP = "http://localhost:3000";

describe("PUBLIC GET /api/flags", () => {
  beforeAll(async () => {
    await prisma.featureFlag.create({ data: { key: KEY, enabled: true } });
  });

  it("returns 200 with the row map WITHOUT any cookie (public route, no auth)", async () => {
    const res = await GET(new Request(APP + "/api/flags"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { flags: Record<string, boolean> };
    expect(body.flags[KEY]).toBe(true);
  });

  it("serves Cache-Control EXACTLY no-store (test-pinned — D2 station 5's flip-and-revisit depends on it)", async () => {
    const res = await GET(new Request(APP + "/api/flags"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("NEVER throws (addendum #9): a DB failure returns 200 { flags: {} } — with the header intact", async () => {
    const spy = vi
      .spyOn(prisma.featureFlag, "findMany")
      .mockRejectedValueOnce(new Error("db down"));
    const res = await GET(new Request(APP + "/api/flags"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flags: {} });
    expect(res.headers.get("cache-control")).toBe("no-store");
    spy.mockRestore();
  });

  afterAll(async () => {
    await prisma.featureFlag.deleteMany({ where: { key: KEY } });
    await prisma.$disconnect();
  });
});
