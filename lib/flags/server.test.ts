// @vitest-environment node
import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { flagEnabledServer } from "./server";

const KEY = `test_server_flag_${Date.now()}`;

describe("flagEnabledServer (never throws — constraint #8)", () => {
  it("returns the declared default when the row is absent", async () => {
    expect(await flagEnabledServer("population_world_map")).toBe(true);
    expect(await flagEnabledServer(`undeclared_${Date.now()}`)).toBe(false);
  });

  it("returns the row value when present", async () => {
    await prisma.featureFlag.create({ data: { key: KEY, enabled: true } });
    expect(await flagEnabledServer(KEY)).toBe(true);
    await prisma.featureFlag.update({ where: { key: KEY }, data: { enabled: false } });
    expect(await flagEnabledServer(KEY)).toBe(false);
  });

  it("NEVER throws — a DB failure degrades to the declared default", async () => {
    const spy = vi
      .spyOn(prisma.featureFlag, "findUnique")
      .mockRejectedValueOnce(new Error("db down"));
    await expect(flagEnabledServer("population_world_map")).resolves.toBe(true);
    spy.mockRestore();
  });

  afterAll(async () => {
    await prisma.featureFlag.deleteMany({ where: { key: KEY } });
    await prisma.$disconnect();
  });
});
