// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { getAddress, pad, toHex } from "viem";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

const PASSPORT = getAddress("0x5fbdb2315678afecb367f032d93f642f64180aa3");

let walletCounter = 1;
function nextWallet(): string {
  return getAddress(pad(toHex(walletCounter++), { size: 20 }));
}

vi.mock("@/config/contracts", () => ({
  passportAddress: () => PASSPORT,
}));
vi.mock("@/lib/passport/serverReads", () => ({
  readApplicantNonceServer: vi.fn(async () => 4n),
  readRequiredWitnessesServer: vi.fn(async () => 7),
}));

import { GET } from "./route";

const APP = "http://localhost:3000";
const ids: string[] = [];

function get(cookieToken?: string) {
  return new Request(APP + "/api/applications/witnesses/request", {
    method: "GET",
    headers: cookieToken ? { cookie: `cr_session=${cookieToken}` } : {},
  });
}

async function seed(opts: {
  status?: string;
  name?: string | null;
  withWallet?: boolean;
}): Promise<{ userId: string; token: string; appId: string; wallet: string }> {
  const wallet = nextWallet();
  const user = await prisma.user.create({
    data: {
      email: `wreq${Date.now()}${Math.random()}@ex.org`,
      application: {
        create: { status: opts.status ?? "OATH_ACCEPTED", name: opts.name ?? "A. Nakadai" },
      },
      ...(opts.withWallet
        ? { linkedWallets: { create: { address: wallet, chain: "EVM", verifiedAt: new Date() } } }
        : {}),
    },
    include: { application: true },
  });
  const { token } = await createSession(user.id);
  ids.push(user.id);
  return { userId: user.id, token, appId: user.application!.id, wallet };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("GET /api/applications/witnesses/request", () => {
  it("401 without a session", async () => {
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it("400 when the user has no verified wallet", async () => {
    const { token } = await seed({ withWallet: false });
    const res = await GET(get(token));
    expect(res.status).toBe(400);
  });

  it("returns typed data with applicant bound to the LinkedWallet + persists nonce/deadline", async () => {
    const { token, userId, wallet } = await seed({ withWallet: true });
    const res = await GET(get(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      domain: { name: string; chainId: number; verifyingContract: string };
      primaryType: string;
      message: { applicant: string; nameHash: string; nonce: string; deadline: string };
      requiredWitnesses: number;
    };
    expect(body.primaryType).toBe("Attestation");
    expect(body.domain.name).toBe("CryptRepublicPassport");
    expect(getAddress(body.message.applicant)).toBe(getAddress(wallet));
    expect(body.message.nonce).toBe("4");
    expect(body.requiredWitnesses).toBe(7);

    const app = await prisma.citizenshipApplication.findUnique({ where: { userId } });
    expect(app?.witnessNonce).toBe("4");
    expect(app?.applicantAddress).toBe(getAddress(wallet));
    expect(app?.witnessDeadline).toBe(body.message.deadline);
  });

  it("clears previously collected signatures on a fresh request", async () => {
    const { token, appId } = await seed({ withWallet: true });
    // seed a stale sig
    await prisma.witnessSignature.create({
      data: {
        applicationId: appId,
        witnessAddress: getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"),
        signature: "0x" + "aa".repeat(65),
        nonce: "0",
        deadline: "1",
      },
    });
    const res = await GET(get(token));
    expect(res.status).toBe(200);
    const remaining = await prisma.witnessSignature.count({ where: { applicationId: appId } });
    expect(remaining).toBe(0);
  });
});
