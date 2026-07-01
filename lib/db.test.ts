// @vitest-environment node
// lib/db.ts imports "server-only", which throws under the default jsdom (browser-like)
// env; this per-file pragma runs the DB test in Node, where server-only resolves fine.
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./db";

describe("prisma health model", () => {
  it("creates and reads a Health row", async () => {
    const row = await prisma.health.create({ data: { note: "wave1" } });
    const found = await prisma.health.findUnique({ where: { id: row.id } });
    expect(found?.note).toBe("wave1");
    await prisma.health.delete({ where: { id: row.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
