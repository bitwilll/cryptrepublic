// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./db";

describe("prisma user model", () => {
  it("creates and reads a User row with passwordHash", async () => {
    const email = `t${Date.now()}@example.org`;
    const u = await prisma.user.create({
      data: { email, passwordHash: "$argon2id$stub", name: "Test" },
    });
    const found = await prisma.user.findUnique({ where: { id: u.id } });
    expect(found?.email).toBe(email);
    expect(found?.failedLoginCount).toBe(0);
    expect(found?.kycStatus).toBe("NONE");
    await prisma.user.delete({ where: { id: u.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
