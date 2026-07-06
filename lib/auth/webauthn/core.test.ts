// @vitest-environment node
import { describe, it, expect, afterAll, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  rpId,
  expectedOrigins,
  storeChallenge,
  consumeChallenge,
  challengeFromClientData,
  publicKeyToString,
  publicKeyFromString,
  transportsToString,
  transportsFromString,
  CHALLENGE_TTL_MS,
} from "./core";

const stored: string[] = [];
const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
});

afterAll(async () => {
  await prisma.webAuthnChallenge.deleteMany({ where: { challenge: { in: stored } } });
  await prisma.$disconnect();
});

function uniqueChallenge(): string {
  const c = `w14-test-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  stored.push(c);
  return c;
}

describe("webauthn core", () => {
  it("rpId strips www. and ports; expectedOrigins carries the www twin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.cryptrepublic.com";
    expect(rpId()).toBe("cryptrepublic.com");
    expect(expectedOrigins()).toEqual([
      "https://www.cryptrepublic.com",
      "https://cryptrepublic.com",
    ]);

    process.env.NEXT_PUBLIC_APP_URL = "https://cryptrepublic.com";
    expect(rpId()).toBe("cryptrepublic.com");
    expect(expectedOrigins()).toEqual([
      "https://cryptrepublic.com",
      "https://www.cryptrepublic.com",
    ]);

    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(rpId()).toBe("localhost"); // hostname, no port
    expect(expectedOrigins()).toContain("http://localhost:3000");
  });

  it("storeChallenge persists a TTL'd row; consumeChallenge is single-use", async () => {
    const c = uniqueChallenge();
    await storeChallenge(c, "authentication");
    const row = await prisma.webAuthnChallenge.findUnique({ where: { challenge: c } });
    expect(row?.type).toBe("authentication");
    expect(row?.userId).toBeNull();
    expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + CHALLENGE_TTL_MS + 2000);

    expect(await consumeChallenge(c, "authentication")).toBe(true);
    expect(await consumeChallenge(c, "authentication")).toBe(false); // replay
  });

  it("a registration challenge is bound to its user; the wrong user/type/expiry all fail", async () => {
    const c = uniqueChallenge();
    await storeChallenge(c, "registration", "user-a");
    expect(await consumeChallenge(c, "registration", "user-b")).toBe(false); // wrong user
    expect(await consumeChallenge(c, "authentication", "user-a")).toBe(false); // wrong type
    expect(await consumeChallenge(c, "registration", "user-a")).toBe(true);

    const expired = uniqueChallenge();
    await storeChallenge(expired, "registration", "user-a");
    await prisma.webAuthnChallenge.update({
      where: { challenge: expired },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await consumeChallenge(expired, "registration", "user-a")).toBe(false); // expired
  });

  it("challengeFromClientData decodes the browser's clientDataJSON; garbage → null", () => {
    const clientData = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge: "aBc123_-", origin: "http://x" }),
      "utf8",
    ).toString("base64url");
    expect(challengeFromClientData(clientData)).toBe("aBc123_-");
    expect(challengeFromClientData("!!!not-base64url-json!!!")).toBeNull();
    expect(challengeFromClientData(Buffer.from("{}", "utf8").toString("base64url"))).toBeNull();
  });

  it("publicKey and transports round-trip their storage encodings", () => {
    const pk = new Uint8Array([1, 2, 3, 250, 251, 252]);
    expect(publicKeyFromString(publicKeyToString(pk))).toEqual(pk);
    expect(transportsToString(["internal", "hybrid"])).toBe("internal,hybrid");
    expect(transportsFromString("internal,hybrid")).toEqual(["internal", "hybrid"]);
    expect(transportsToString([])).toBeNull();
    expect(transportsFromString(null)).toBeUndefined();
  });
});
