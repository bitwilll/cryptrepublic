// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { MAX_FAILED } from "@/lib/auth/lockout";

const APP = "http://localhost:3000";
const post = (body: unknown, origin = APP) =>
  new Request(APP + "/api/auth/x", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function cookieToken(res: Response): string | undefined {
  const sc = res.headers.get("set-cookie") ?? "";
  return sc.match(/cr_session=([^;]+)/)?.[1];
}

describe("email auth routes", () => {
  const email = `r${Date.now()}@auth-routes.example`;
  const lockEmail = `lock${Date.now()}@auth-routes.example`;
  const pass = "correct horse battery";

  it("rejects a foreign origin with 403", async () => {
    const res = await register(
      post({ email, passphrase: pass, name: "Ann" }, "https://evil.example"),
    );
    expect(res.status).toBe(403);
  });

  it("registers, sets cr_session cookie, and creates a DRAFT application", async () => {
    const res = await register(post({ email, passphrase: pass, name: "Ann" }));
    expect(res.status).toBe(200);
    expect(cookieToken(res)).toBeTruthy();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { application: true },
    });
    expect(user.application?.status).toBe("DRAFT");
    expect(user.passwordHash?.startsWith("$argon2id$")).toBe(true);
  });

  it("does not reveal that an email already exists", async () => {
    const res = await register(post({ email, passphrase: pass, name: "Ann" }));
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(email);
    expect([200, 409]).toContain(res.status);
  });

  it("login with wrong password returns a generic 401", async () => {
    const res = await login(post({ email, passphrase: "totally wrong" }));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain("no such user");
  });

  it("locks the account after MAX_FAILED failed logins", async () => {
    await register(post({ email: lockEmail, passphrase: pass, name: "L" }));
    for (let i = 0; i < MAX_FAILED; i++)
      await login(post({ email: lockEmail, passphrase: "nope" }));
    const res = await login(post({ email: lockEmail, passphrase: pass })); // correct pw, but locked
    expect(res.status).toBe(401);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: lockEmail } });
    expect(u.lockedUntil).not.toBeNull();
  });

  it("login succeeds with the right password and logout clears the session", async () => {
    const ok = await login(post({ email, passphrase: pass }));
    expect(ok.status).toBe(200);
    const token = cookieToken(ok)!;
    const out = await logout(
      new Request(APP + "/api/auth/logout", {
        method: "POST",
        headers: { origin: APP, cookie: `cr_session=${token}` },
      }),
    );
    expect(out.status).toBe(200);
    expect(
      await prisma.session.findUnique({
        where: { tokenHash: (await import("@/lib/auth/tokens")).hashToken(token) },
      }),
    ).toBeNull();
    // The clear cookie mirrors the set attributes (HttpOnly/SameSite/Path) and
    // expires immediately (audit hardening).
    const clear = out.headers.get("set-cookie") ?? "";
    expect(clear).toMatch(/cr_session=;/);
    expect(clear).toMatch(/HttpOnly/);
    expect(clear).toMatch(/SameSite=Lax/);
    expect(clear).toMatch(/Max-Age=0/);
  });

  afterAll(async () => {
    // Delete ONLY this suite's fixtures. Vitest runs files in parallel against
    // the shared dev.db, so a domain-wide deleteMany cascades sessions out from
    // under other suites mid-run (intermittent 401s — see c23f524).
    await prisma.user.deleteMany({ where: { email: { in: [email, lockEmail] } } });
    await prisma.$disconnect();
  });
});
