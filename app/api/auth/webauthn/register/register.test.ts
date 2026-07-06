// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { storeChallenge } from "@/lib/auth/webauthn/core";
import { __resetRateLimit } from "@/lib/auth/ratelimit";

// Keep generate* REAL (pure options builders); mock ONLY the attestation
// verifier — the unit boundary is OUR route logic (guards, challenge binding,
// storage). The real cryptographic path is proven in e2e/passkeys.spec.ts via
// the CDP virtual authenticator.
const verifyRegistrationMock = vi.hoisted(() => vi.fn());
vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@simplewebauthn/server")>();
  return { ...real, verifyRegistrationResponse: verifyRegistrationMock };
});

import { POST as optionsPost } from "./options/route";
import { POST as verifyPost } from "./verify/route";

const APP = "http://localhost:3000";
let userId: string;
let otherUserId: string;
let token: string;
const createdUsers: string[] = [];

function req(path: string, body?: unknown, opts: { token?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const origin = opts.origin === undefined ? APP : opts.origin;
  if (origin) headers.origin = origin;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function clientDataFor(challenge: string): string {
  return Buffer.from(
    JSON.stringify({ type: "webauthn.create", challenge, origin: APP }),
    "utf8",
  ).toString("base64url");
}

function fakeResponse(challenge: string, credId = "cred-abc"): Record<string, unknown> {
  return {
    id: credId,
    rawId: credId,
    type: "public-key",
    response: { clientDataJSON: clientDataFor(challenge), attestationObject: "o2NmbXQ" },
    clientExtensionResults: {},
  };
}

function verifiedInfo(credId: string) {
  return {
    verified: true as const,
    registrationInfo: {
      credential: {
        id: credId,
        publicKey: new Uint8Array([9, 8, 7]),
        counter: 5,
        transports: ["internal"],
      },
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
    },
  };
}

describe("WebAuthn register options + verify", () => {
  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await prisma.user.create({ data: { email: `wa-reg-${suffix}@w14.example` } });
    const o = await prisma.user.create({ data: { email: `wa-reg-other-${suffix}@w14.example` } });
    userId = u.id;
    otherUserId = o.id;
    createdUsers.push(u.id, o.id);
    ({ token } = await createSession(userId));
  });

  beforeEach(() => {
    __resetRateLimit();
    verifyRegistrationMock.mockReset();
  });

  afterAll(async () => {
    await prisma.webAuthnCredential.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.webAuthnChallenge.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  });

  it("options: 403 foreign origin; 401 without a session", async () => {
    expect(
      (await optionsPost(req("/x", undefined, { token, origin: "https://evil.example" }))).status,
    ).toBe(403);
    expect((await optionsPost(req("/x"))).status).toBe(401);
  });

  it("options: issues discoverable-credential options and stores a user-bound challenge", async () => {
    const res = await optionsPost(req("/x", undefined, { token }));
    expect(res.status).toBe(200);
    const { options } = (await res.json()) as {
      options: {
        challenge: string;
        rp: { id: string };
        authenticatorSelection: { residentKey: string };
      };
    };
    expect(options.challenge.length).toBeGreaterThan(10);
    expect(options.rp.id).toBe("localhost");
    expect(options.authenticatorSelection.residentKey).toBe("required");
    const row = await prisma.webAuthnChallenge.findUnique({
      where: { challenge: options.challenge },
    });
    expect(row?.type).toBe("registration");
    expect(row?.userId).toBe(userId);
  });

  it("verify: happy path stores ONLY public credential data (base64url key, counter, label)", async () => {
    const challenge = `w14-reg-happy-${Date.now()}`;
    await storeChallenge(challenge, "registration", userId);
    const credId = `cred-happy-${Date.now()}`;
    verifyRegistrationMock.mockResolvedValue(verifiedInfo(credId));

    const res = await verifyPost(
      req(
        "/x",
        { response: fakeResponse(challenge, credId), label: "MacBook Touch ID" },
        { token },
      ),
    );
    expect(res.status).toBe(200);
    const row = await prisma.webAuthnCredential.findUnique({ where: { credentialId: credId } });
    expect(row?.userId).toBe(userId);
    expect(row?.publicKey).toBe(Buffer.from(new Uint8Array([9, 8, 7])).toString("base64url"));
    expect(row?.counter).toBe(5n);
    expect(row?.deviceType).toBe("multiDevice");
    expect(row?.backedUp).toBe(true);
    expect(row?.label).toBe("MacBook Touch ID");
  });

  it("verify: the challenge is single-use (a replay 400s, no second row)", async () => {
    const challenge = `w14-reg-replay-${Date.now()}`;
    await storeChallenge(challenge, "registration", userId);
    verifyRegistrationMock.mockResolvedValue(verifiedInfo(`cred-replay-${Date.now()}`));
    expect(
      (
        await verifyPost(
          req("/x", { response: fakeResponse(challenge, `cr-${Date.now()}`) }, { token }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await verifyPost(req("/x", { response: fakeResponse(challenge, "cred-again") }, { token })))
        .status,
    ).toBe(400);
    expect(
      await prisma.webAuthnCredential.findUnique({ where: { credentialId: "cred-again" } }),
    ).toBeNull();
  });

  it("verify: ANOTHER user's challenge is rejected (user-bound)", async () => {
    const challenge = `w14-reg-crossuser-${Date.now()}`;
    await storeChallenge(challenge, "registration", otherUserId);
    verifyRegistrationMock.mockResolvedValue(verifiedInfo("cred-cross"));
    expect(
      (await verifyPost(req("/x", { response: fakeResponse(challenge, "cred-cross") }, { token })))
        .status,
    ).toBe(400);
  });

  it("verify: an unverified attestation stores nothing", async () => {
    const challenge = `w14-reg-fail-${Date.now()}`;
    await storeChallenge(challenge, "registration", userId);
    verifyRegistrationMock.mockResolvedValue({ verified: false });
    expect(
      (await verifyPost(req("/x", { response: fakeResponse(challenge, "cred-nope") }, { token })))
        .status,
    ).toBe(400);
    expect(
      await prisma.webAuthnCredential.findUnique({ where: { credentialId: "cred-nope" } }),
    ).toBeNull();
  });

  it("verify: 400 on a bad body / malformed clientDataJSON", async () => {
    expect((await verifyPost(req("/x", { nope: 1 }, { token }))).status).toBe(400);
    expect(
      (
        await verifyPost(
          req(
            "/x",
            {
              response: {
                id: "x",
                rawId: "x",
                type: "public-key",
                response: { clientDataJSON: "!!!" },
                clientExtensionResults: {},
              },
            },
            { token },
          ),
        )
      ).status,
    ).toBe(400);
  });
});
