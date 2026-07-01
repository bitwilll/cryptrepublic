// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "./password";
import {
  createSession,
  validateSessionToken,
  revokeSessionToken,
  revokeAllForUser,
  SESSION_COOKIE,
} from "./session";

async function makeUser() {
  return prisma.user.create({
    data: {
      email: `s${Date.now()}${Math.random()}@ex.org`,
      passwordHash: await hashPassword("x".repeat(12)),
    },
  });
}

describe("sessions", () => {
  it("issue → validate → revoke lifecycle", async () => {
    const u = await makeUser();
    const { token, session } = await createSession(u.id);
    const ok = await validateSessionToken(token);
    expect(ok?.user.id).toBe(u.id);
    expect(ok?.session.id).toBe(session.id);
    await revokeSessionToken(token);
    expect(await validateSessionToken(token)).toBeNull();
    await prisma.user.delete({ where: { id: u.id } });
  });

  it("expired sessions do not validate", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    const hash = (await import("./tokens")).hashToken(token);
    await prisma.session.update({
      where: { tokenHash: hash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await validateSessionToken(token)).toBeNull();
    await prisma.user.delete({ where: { id: u.id } });
  });

  it("revokeAllForUser clears every session", async () => {
    const u = await makeUser();
    const a = await createSession(u.id);
    const b = await createSession(u.id);
    await revokeAllForUser(u.id);
    expect(await validateSessionToken(a.token)).toBeNull();
    expect(await validateSessionToken(b.token)).toBeNull();
    await prisma.user.delete({ where: { id: u.id } });
  });

  it("cookie name is cr_session", () => {
    expect(SESSION_COOKIE).toBe("cr_session");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
