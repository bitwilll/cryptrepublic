// @vitest-environment node
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { MAX_FAILED } from "@/lib/auth/lockout";
import { __resetRateLimit } from "@/lib/auth/ratelimit";

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

  // ── Wave 17: ?ref=<code> signup binding ────────────────────────────────
  describe("register with a referral-link code", () => {
    const linkOwnerEmail = `linkowner${Date.now()}@auth-routes.example`;
    const viaEmail = `via${Date.now()}@auth-routes.example`;
    const badEmail = `bad${Date.now()}@auth-routes.example`;
    const revokedEmail = `revoked${Date.now()}@auth-routes.example`;
    let linkOwnerId: string;
    let liveLinkId: string;
    const liveCode = `livecode${Date.now() % 100}`;
    const revokedCode = `deadcode${Date.now() % 100}`;

    it("binds the signup to the link owner as a Referral (viaLinkId, no token spent)", async () => {
      const owner = await prisma.user.create({ data: { email: linkOwnerEmail } });
      linkOwnerId = owner.id;
      const live = await prisma.referralLink.create({
        data: { code: liveCode, ownerUserId: linkOwnerId },
      });
      liveLinkId = live.id;
      await prisma.referralLink.create({
        data: { code: revokedCode, ownerUserId: linkOwnerId, revokedAt: new Date() },
      });

      const res = await register(
        post({ email: viaEmail, passphrase: pass, name: "Via", refCode: liveCode }),
      );
      expect(res.status).toBe(200);
      const referred = await prisma.user.findUniqueOrThrow({ where: { email: viaEmail } });
      const edge = await prisma.referral.findUniqueOrThrow({
        where: {
          referrerUserId_referredUserId: {
            referrerUserId: linkOwnerId,
            referredUserId: referred.id,
          },
        },
      });
      expect(edge.viaLinkId).toBe(liveLinkId);
      expect(edge.whenTokenConsumed).toBe(false);
    });

    it("SILENTLY ignores an unknown code — registration still succeeds, no referral", async () => {
      const res = await register(
        post({ email: badEmail, passphrase: pass, name: "Bad", refCode: "nosuchcode99" }),
      );
      expect(res.status).toBe(200);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: badEmail } });
      expect(await prisma.referral.count({ where: { referredUserId: user.id } })).toBe(0);
    });

    it("SILENTLY ignores a REVOKED code — registration still succeeds, no referral", async () => {
      const res = await register(
        post({ email: revokedEmail, passphrase: pass, name: "Rev", refCode: revokedCode }),
      );
      expect(res.status).toBe(200);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: revokedEmail } });
      expect(await prisma.referral.count({ where: { referredUserId: user.id } })).toBe(0);
    });

    describe("registration policy (Cabinet flags)", () => {
      // Flag rows are GLOBAL test-db state; this is the ONLY suite that calls
      // the register route (grep-verified), and vitest runs tests within a
      // file sequentially — each test sets the policy it needs and afterAll
      // deletes the rows, restoring the declared OPEN defaults.
      beforeEach(() => __resetRateLimit());
      const setPolicy = async (open: boolean, referralOnly: boolean) => {
        await prisma.featureFlag.upsert({
          where: { key: "registration_open" },
          update: { enabled: open },
          create: { key: "registration_open", enabled: open },
        });
        await prisma.featureFlag.upsert({
          where: { key: "registration_referral_only" },
          update: { enabled: referralOnly },
          create: { key: "registration_referral_only", enabled: referralOnly },
        });
      };

      it("CLOSED: 403 with the Cabinet message; no user is created", async () => {
        await setPolicy(false, false);
        const em = `closed${Date.now()}@auth-routes.example`;
        const res = await register(post({ email: em, passphrase: pass, name: "C" }));
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toMatch(/closed by order of the cabinet/i);
        expect(await prisma.user.findUnique({ where: { email: em } })).toBeNull();
      });

      it("REFERRAL_ONLY: 403 without a code, with an unknown code, and with a revoked code", async () => {
        await setPolicy(true, true);
        const em = `refonly${Date.now()}@auth-routes.example`;
        for (const refCode of [undefined, "nosuchcode99", revokedCode]) {
          const res = await register(
            post({ email: em, passphrase: pass, name: "R", ...(refCode ? { refCode } : {}) }),
          );
          expect(res.status).toBe(403);
          const body = (await res.json()) as { error?: string };
          expect(body.error).toMatch(/by referral only/i);
        }
        expect(await prisma.user.findUnique({ where: { email: em } })).toBeNull();
      });

      it("REFERRAL_ONLY: a VALID code registers and binds the referral edge", async () => {
        await setPolicy(true, true);
        const em = `refok${Date.now()}@auth-routes.example`;
        const res = await register(
          post({ email: em, passphrase: pass, name: "OK", refCode: liveCode }),
        );
        expect(res.status).toBe(200);
        const user = await prisma.user.findUniqueOrThrow({ where: { email: em } });
        const edge = await prisma.referral.findUniqueOrThrow({
          where: {
            referrerUserId_referredUserId: {
              referrerUserId: linkOwnerId,
              referredUserId: user.id,
            },
          },
        });
        expect(edge.viaLinkId).toBe(liveLinkId);
        await prisma.user.delete({ where: { id: user.id } });
      });

      it("back to OPEN: an unknown code is silently ignored again", async () => {
        await setPolicy(true, false);
        const em = `reopen${Date.now()}@auth-routes.example`;
        const res = await register(
          post({ email: em, passphrase: pass, name: "O", refCode: "nosuchcode99" }),
        );
        expect(res.status).toBe(200);
        await prisma.user.delete({ where: { email: em } });
      });

      afterAll(async () => {
        await prisma.featureFlag.deleteMany({
          where: { key: { in: ["registration_open", "registration_referral_only"] } },
        });
      });
    });

    it("400 when refCode exceeds 32 chars (schema bound)", async () => {
      const res = await register(
        post({
          email: `long${Date.now()}@auth-routes.example`,
          passphrase: pass,
          name: "Long",
          refCode: "x".repeat(33),
        }),
      );
      expect(res.status).toBe(400);
    });

    afterAll(async () => {
      await prisma.user.deleteMany({
        where: { email: { in: [linkOwnerEmail, viaEmail, badEmail, revokedEmail] } },
      });
    });
  });

  afterAll(async () => {
    // Delete ONLY this suite's fixtures. Vitest runs files in parallel against
    // the shared dev.db, so a domain-wide deleteMany cascades sessions out from
    // under other suites mid-run (intermittent 401s — see c23f524).
    await prisma.user.deleteMany({ where: { email: { in: [email, lockEmail] } } });
    await prisma.$disconnect();
  });
});
