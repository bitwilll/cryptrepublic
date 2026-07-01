// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { isLocked, registerFailedLogin, resetFailedLogins, MAX_FAILED } from "./lockout";

describe("account lockout", () => {
  it("locks after MAX_FAILED failed logins and resets on success", async () => {
    const u = await prisma.user.create({
      data: { email: `l${Date.now()}@ex.org`, passwordHash: "$argon2id$x" },
    });
    for (let i = 0; i < MAX_FAILED; i++) await registerFailedLogin(u.id);
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(locked.failedLoginCount).toBe(MAX_FAILED);
    expect(isLocked(locked)).toBe(true);
    await resetFailedLogins(u.id);
    const clear = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(isLocked(clear)).toBe(false);
    expect(clear.failedLoginCount).toBe(0);
    await prisma.user.delete({ where: { id: u.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
