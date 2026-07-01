// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { getAddress, pad, toHex, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { ATTESTATION_TYPES, attestationDomain, nameHashOf } from "@/lib/passport/attestation";

const PASSPORT = getAddress("0x5fbdb2315678afecb367f032d93f642f64180aa3");
const CHAIN_ID = 84532; // default testnet profile active in tests

let walletCounter = 1;
function nextAddr(): string {
  return getAddress(pad(toHex(walletCounter++), { size: 20 }));
}

const hasPassportMock = vi.fn(async () => true);
vi.mock("@/config/contracts", () => ({ passportAddress: () => PASSPORT }));
vi.mock("@/lib/passport/serverReads", () => ({
  readHasPassportServer: (...args: unknown[]) => hasPassportMock(...(args as [])),
  readRequiredWitnessesServer: async () => 2,
}));

import { POST } from "./route";

const APP = "http://localhost:3000";
const ids: string[] = [];

const NONCE = "4";
const DEADLINE = "1800000000";
const NAME = "A. Nakadai";

async function seedApplication(
  applicant: string,
): Promise<{ userId: string; token: string; appId: string }> {
  const user = await prisma.user.create({
    data: {
      email: `wsub${Date.now()}${Math.random()}@ex.org`,
      application: {
        create: {
          status: "OATH_ACCEPTED",
          name: NAME,
          applicantAddress: getAddress(applicant),
          witnessNonce: NONCE,
          witnessDeadline: DEADLINE,
        },
      },
    },
    include: { application: true },
  });
  const { token } = await createSession(user.id);
  ids.push(user.id);
  return { userId: user.id, token, appId: user.application!.id };
}

async function signAs(pk: Hex, applicant: string): Promise<Hex> {
  const account = privateKeyToAccount(pk);
  return account.signTypedData({
    domain: attestationDomain(CHAIN_ID, PASSPORT),
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: {
      applicant: getAddress(applicant),
      nameHash: nameHashOf(NAME),
      nonce: BigInt(NONCE),
      deadline: BigInt(DEADLINE),
    },
  });
}

function post(body: unknown, token: string, origin = APP) {
  return new Request(APP + "/api/applications/witnesses/submit", {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: `cr_session=${token}` },
    body: JSON.stringify(body),
  });
}

function attestationBody(applicant: string, signature: Hex) {
  return {
    attestation: {
      applicant: getAddress(applicant),
      nameHash: nameHashOf(NAME),
      nonce: NONCE,
      deadline: DEADLINE,
    },
    signature,
  };
}

beforeEach(() => {
  hasPassportMock.mockReset();
  hasPassportMock.mockResolvedValue(true);
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("POST /api/applications/witnesses/submit", () => {
  it("403 on a foreign origin", async () => {
    const applicant = nextAddr();
    const { token } = await seedApplication(applicant);
    const sig = await signAs(generatePrivateKey(), applicant);
    const res = await POST(post(attestationBody(applicant, sig), token, "https://evil.example"));
    expect(res.status).toBe(403);
  });

  it("accepts a valid citizen witness signature and increments the count", async () => {
    const applicant = nextAddr();
    const { token, appId } = await seedApplication(applicant);
    const sig = await signAs(generatePrivateKey(), applicant);
    const res = await POST(post(attestationBody(applicant, sig), token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; collected: number; required: number };
    expect(body.ok).toBe(true);
    expect(body.collected).toBe(1);
    expect(body.required).toBe(2);
    const count = await prisma.witnessSignature.count({ where: { applicationId: appId } });
    expect(count).toBe(1);
  });

  it("rejects a signature whose attestation.applicant mismatches the application (applicant-binding)", async () => {
    const applicant = nextAddr();
    const other = nextAddr();
    const { token } = await seedApplication(applicant);
    // Sign for `other`, submit under this application (bound to `applicant`).
    const sig = await signAs(generatePrivateKey(), other);
    const res = await POST(post(attestationBody(other, sig), token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/different applicant/i);
  });

  it("rejects a stale nonce/deadline", async () => {
    const applicant = nextAddr();
    const { token } = await seedApplication(applicant);
    const sig = await signAs(generatePrivateKey(), applicant);
    const body = attestationBody(applicant, sig);
    body.attestation.nonce = "999"; // drift
    const res = await POST(post(body, token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/stale/i);
  });

  it("rejects a self-attestation (witness === applicant)", async () => {
    const pk = generatePrivateKey();
    const applicant = privateKeyToAccount(pk).address;
    const { token } = await seedApplication(applicant);
    const sig = await signAs(pk, applicant); // signer IS the applicant
    const res = await POST(post(attestationBody(applicant, sig), token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/own application/i);
  });

  it("rejects a witness who is not a citizen", async () => {
    hasPassportMock.mockResolvedValue(false);
    const applicant = nextAddr();
    const { token } = await seedApplication(applicant);
    const sig = await signAs(generatePrivateKey(), applicant);
    const res = await POST(post(attestationBody(applicant, sig), token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/existing citizens/i);
  });

  it("rejects a duplicate witness (same address signs twice)", async () => {
    const applicant = nextAddr();
    const { token } = await seedApplication(applicant);
    const pk = generatePrivateKey();
    const sig = await signAs(pk, applicant);
    const first = await POST(post(attestationBody(applicant, sig), token));
    expect(first.status).toBe(200);
    const second = await POST(post(attestationBody(applicant, sig), token));
    expect(second.status).toBe(400);
    expect((await second.json()).error).toMatch(/already signed/i);
  });

  it("transitions to WITNESSED when the required count is reached", async () => {
    const applicant = nextAddr();
    const { token, userId, appId } = await seedApplication(applicant);
    await POST(
      post(attestationBody(applicant, await signAs(generatePrivateKey(), applicant)), token),
    );
    await POST(
      post(attestationBody(applicant, await signAs(generatePrivateKey(), applicant)), token),
    );
    const app = await prisma.citizenshipApplication.findUnique({ where: { userId } });
    expect(app?.status).toBe("WITNESSED");
    const count = await prisma.witnessSignature.count({ where: { applicationId: appId } });
    expect(count).toBe(2);
  });
});
