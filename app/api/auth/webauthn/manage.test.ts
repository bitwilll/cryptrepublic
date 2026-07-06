// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { publicKeyToString } from "@/lib/auth/webauthn/core";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { GET as credentialsGet } from "./credentials/route";
import { POST as deletePost } from "./credentials/delete/route";
import { POST as twoFaPost } from "./2fa/route";
import { POST as loginPost } from "@/app/api/auth/login/route";

/**
 * Passkey management + the require-passkey step-up branch in password login.
 * No-lockout invariants: enabling requires a passkey; deleting the LAST
 * passkey auto-disables the flag; the login branch only fires while a passkey
 * exists.
 */

const APP = "http://localhost:3000";
const PASS = "correct horse battery staple";
let userId: string;
let otherUserId: string;
let email: string;
let token: string;
const createdUsers: string[] = [];

function req(
  path: string,
  body?: unknown,
  opts: { token?: string; origin?: string | null; method?: string } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const origin = opts.origin === undefined ? APP : opts.origin;
  if (origin) headers.origin = origin;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}${path}`, {
    method: opts.method ?? "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function addCredential(uid: string, credentialId: string) {
  await prisma.webAuthnCredential.create({
    data: {
      credentialId,
      userId: uid,
      publicKey: publicKeyToString(new Uint8Array([7, 7, 7])),
      counter: 0n,
      deviceType: "multiDevice",
      backedUp: true,
      label: "Test key",
    },
  });
}

describe("WebAuthn manage + the login step-up branch", () => {
  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    email = `wa-manage-${suffix}@w14.example`;
    const passwordHash = await hashPassword(PASS);
    const u = await prisma.user.create({ data: { email, passwordHash } });
    const o = await prisma.user.create({
      data: { email: `wa-manage-other-${suffix}@w14.example`, passwordHash },
    });
    userId = u.id;
    otherUserId = o.id;
    createdUsers.push(u.id, o.id);
    ({ token } = await createSession(userId));
  });

  beforeEach(() => __resetRateLimit());

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  });

  it("credentials GET: 401 without a session; lists public metadata + the flag", async () => {
    expect((await credentialsGet(req("/x", undefined, { method: "GET" }))).status).toBe(401);
    await addCredential(userId, `mng-list-${Date.now()}`);
    const res = await credentialsGet(req("/x", undefined, { method: "GET", token }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      credentials: { id: string; label: string | null; deviceType: string }[];
      passkey2faEnabled: boolean;
    };
    expect(body.credentials.length).toBeGreaterThan(0);
    expect(body.credentials[0].label).toBe("Test key");
    expect(body.passkey2faEnabled).toBe(false);
    // Public metadata only — no key material in the listing.
    expect(JSON.stringify(body)).not.toContain("publicKey");
  });

  it("2fa enable without a passkey → 400 (no lockout by construction)", async () => {
    await prisma.webAuthnCredential.deleteMany({ where: { userId } });
    const res = await twoFaPost(req("/x", { enabled: true }, { token }));
    expect(res.status).toBe(400);
  });

  it("the full step-up cycle: enable → password login returns twoFactor (NO session) → delete last passkey auto-disables → login issues sessions again", async () => {
    const credId = `mng-cycle-${Date.now()}`;
    await addCredential(userId, credId);

    // Enable the flag (allowed: a passkey exists).
    const on = await twoFaPost(req("/x", { enabled: true }, { token }));
    expect(on.status).toBe(200);
    expect(((await on.json()) as { passkey2faEnabled: boolean }).passkey2faEnabled).toBe(true);

    // Password login now returns the step-up marker WITHOUT a cookie.
    const stepUp = await loginPost(req("/api/auth/login", { email, passphrase: PASS }));
    expect(stepUp.status).toBe(200);
    const stepUpBody = (await stepUpBodyOf(stepUp)) as {
      ok: boolean;
      twoFactor?: boolean;
      next?: string;
    };
    expect(stepUpBody.twoFactor).toBe(true);
    expect(stepUpBody.next).toBeUndefined();
    expect(stepUp.headers.get("set-cookie")).toBeNull();

    // Deleting another user's (nonexistent) credential is an opaque 400.
    expect((await deletePost(req("/x", { credentialId: "not-mine" }, { token }))).status).toBe(400);

    // Deleting the LAST passkey auto-disables the flag in the same transaction.
    const del = await deletePost(req("/x", { credentialId: credId }, { token }));
    expect(del.status).toBe(200);
    const delBody = (await del.json()) as { remaining: number; passkey2faEnabled: boolean };
    expect(delBody.remaining).toBe(0);
    expect(delBody.passkey2faEnabled).toBe(false);

    // Password login issues a session again — never locked out.
    const back = await loginPost(req("/api/auth/login", { email, passphrase: PASS }));
    expect(back.status).toBe(200);
    expect(back.headers.get("set-cookie")).toMatch(/cr_session=/);
  });

  it("deleting one of TWO passkeys keeps the flag on", async () => {
    const a = `mng-two-a-${Date.now()}`;
    const b = `mng-two-b-${Date.now()}`;
    await addCredential(userId, a);
    await addCredential(userId, b);
    expect((await twoFaPost(req("/x", { enabled: true }, { token }))).status).toBe(200);
    const del = await deletePost(req("/x", { credentialId: a }, { token }));
    const body = (await del.json()) as { remaining: number; passkey2faEnabled: boolean };
    expect(body.remaining).toBe(1);
    expect(body.passkey2faEnabled).toBe(true);
    // cleanup for other tests
    await deletePost(req("/x", { credentialId: b }, { token }));
  });

  it("cannot delete a credential that belongs to another user", async () => {
    const foreign = `mng-foreign-${Date.now()}`;
    await addCredential(otherUserId, foreign);
    expect((await deletePost(req("/x", { credentialId: foreign }, { token }))).status).toBe(400);
    expect(
      await prisma.webAuthnCredential.findUnique({ where: { credentialId: foreign } }),
    ).not.toBeNull();
  });
});

async function stepUpBodyOf(res: Response): Promise<unknown> {
  return res.json();
}
