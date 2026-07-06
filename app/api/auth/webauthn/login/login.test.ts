// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { storeChallenge, publicKeyToString } from "@/lib/auth/webauthn/core";
import { __resetRateLimit } from "@/lib/auth/ratelimit";

const verifyAuthMock = vi.hoisted(() => vi.fn());
vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@simplewebauthn/server")>();
  return { ...real, verifyAuthenticationResponse: verifyAuthMock };
});

import { POST as optionsPost } from "./options/route";
import { POST as verifyPost } from "./verify/route";

const APP = "http://localhost:3000";
let userId: string;
let suspendedUserId: string;
const CRED_ID = `wa-login-cred-${Date.now()}`;
const SUSP_CRED_ID = `wa-login-susp-${Date.now()}`;
const createdUsers: string[] = [];

function req(body?: unknown, opts: { origin?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const origin = opts.origin === undefined ? APP : opts.origin;
  if (origin) headers.origin = origin;
  return new Request(`${APP}/api/auth/webauthn/login/x`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function clientDataFor(challenge: string): string {
  return Buffer.from(
    JSON.stringify({ type: "webauthn.get", challenge, origin: APP }),
    "utf8",
  ).toString("base64url");
}

function fakeAssertion(challenge: string, credId = CRED_ID): Record<string, unknown> {
  return {
    id: credId,
    rawId: credId,
    type: "public-key",
    response: {
      clientDataJSON: clientDataFor(challenge),
      authenticatorData: "aGVsbG8",
      signature: "c2ln",
    },
    clientExtensionResults: {},
  };
}

async function freshChallenge(): Promise<string> {
  const c = `w14-login-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  await storeChallenge(c, "authentication");
  return c;
}

describe("WebAuthn login options + verify", () => {
  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await prisma.user.create({
      data: {
        email: `wa-login-${suffix}@w14.example`,
        webauthnCredentials: {
          create: {
            credentialId: CRED_ID,
            publicKey: publicKeyToString(new Uint8Array([1, 2, 3])),
            counter: 10n,
            deviceType: "multiDevice",
            backedUp: true,
          },
        },
      },
    });
    const s = await prisma.user.create({
      data: {
        email: `wa-login-susp-${suffix}@w14.example`,
        suspendedAt: new Date(),
        webauthnCredentials: {
          create: {
            credentialId: SUSP_CRED_ID,
            publicKey: publicKeyToString(new Uint8Array([4, 5, 6])),
            counter: 0n,
            deviceType: "singleDevice",
          },
        },
      },
    });
    userId = u.id;
    suspendedUserId = s.id;
    createdUsers.push(u.id, s.id);
  });

  beforeEach(() => {
    __resetRateLimit();
    verifyAuthMock.mockReset();
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  });

  it("options: 403 foreign origin; 200 stores an UNBOUND authentication challenge", async () => {
    expect((await optionsPost(req(undefined, { origin: "https://evil.example" }))).status).toBe(
      403,
    );
    const res = await optionsPost(req());
    expect(res.status).toBe(200);
    const { options } = (await res.json()) as { options: { challenge: string; rpId: string } };
    const row = await prisma.webAuthnChallenge.findUnique({
      where: { challenge: options.challenge },
    });
    expect(row?.type).toBe("authentication");
    expect(row?.userId).toBeNull();
  });

  it("verify: happy path — session cookie, counter persisted, lastUsedAt set", async () => {
    const c = await freshChallenge();
    verifyAuthMock.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 42 } });
    const res = await verifyPost(req({ response: fakeAssertion(c) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; next: string };
    expect(body.next).toBe("/dashboard");
    expect(res.headers.get("set-cookie")).toMatch(/cr_session=/);
    const cred = await prisma.webAuthnCredential.findUnique({ where: { credentialId: CRED_ID } });
    expect(cred?.counter).toBe(42n);
    expect(cred?.lastUsedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId } })).toBeGreaterThan(0);
  });

  it("verify: the challenge is single-use (replay → generic 401, no cookie)", async () => {
    const c = await freshChallenge();
    verifyAuthMock.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 43 } });
    expect((await verifyPost(req({ response: fakeAssertion(c) }))).status).toBe(200);
    const replay = await verifyPost(req({ response: fakeAssertion(c) }));
    expect(replay.status).toBe(401);
    expect(replay.headers.get("set-cookie")).toBeNull();
  });

  it("verify: an unknown credential → the SAME generic 401 (no enumeration)", async () => {
    const c = await freshChallenge();
    const res = await verifyPost(req({ response: fakeAssertion(c, "no-such-credential") }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Passkey sign-in failed.");
  });

  it("verify: a suspended user → the SAME generic 401, no session", async () => {
    const c = await freshChallenge();
    verifyAuthMock.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    const res = await verifyPost(req({ response: fakeAssertion(c, SUSP_CRED_ID) }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Passkey sign-in failed.");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await prisma.session.count({ where: { userId: suspendedUserId } })).toBe(0);
  });

  it("verify: a failed assertion → generic 401 and the counter is NOT advanced", async () => {
    const c = await freshChallenge();
    verifyAuthMock.mockResolvedValue({ verified: false });
    const before = (await prisma.webAuthnCredential.findUnique({
      where: { credentialId: CRED_ID },
    }))!.counter;
    expect((await verifyPost(req({ response: fakeAssertion(c) }))).status).toBe(401);
    const after = (await prisma.webAuthnCredential.findUnique({
      where: { credentialId: CRED_ID },
    }))!.counter;
    expect(after).toBe(before);
  });
});
