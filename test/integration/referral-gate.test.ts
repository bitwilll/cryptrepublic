// @vitest-environment node
//
// LOCAL ANVIL ONLY — Wave 12 referral-gated attestation proof. Deploys the real
// contracts, genesis-seeds a citizen witness, and drives the REAL witness-submit
// route in-process with a CHAIN-REAL citizen check (readHasPassportServer hits
// anvil, not a mock):
//   - a witness who REFERRED the applicant (DB Referral edge) → 200, a row is stored
//   - the SAME citizen witness with NO referral → 400, NO row is stored
// The witness is identified SOLELY by ECDSA recovery; the referral edge is a DB
// lookup keyed on the recovered address → verified LinkedWallet → User.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.NEXT_PUBLIC_CHAIN_ENV = "local";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.RPC_ANVIL = "http://127.0.0.1:8545";

import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { startAnvilWithContracts, foundryAvailable, type AnvilDeployment } from "./anvil-harness";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

// anvil #1 = the citizen witness; #2 = the applicant (LOCAL/THROWAWAY dev keys).
const WITNESS_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const APPLICANT_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;
const witness = privateKeyToAccount(WITNESS_PK);
const applicant = privateKeyToAccount(APPLICANT_PK);

const HAVE_FOUNDRY = foundryAvailable();
const d = HAVE_FOUNDRY ? describe : describe.skip;

type AppMods = {
  attestation: typeof import("@/lib/passport/attestation");
  rpcRoute: typeof import("@/app/api/rpc/[chain]/route");
  submit: typeof import("@/app/api/applications/witnesses/submit/route");
};

let deployment: AnvilDeployment;
let mods: AppMods;
const NAME = "Referred Applicant";
const NONCE = "0";
const DEADLINE = String(Math.floor(Date.now() / 1000) + 3600);

const created: string[] = [];
let applicantUserId: string;
let witnessUserId: string;
let session: string;

d("Wave 12 D4 — referral-gated attestation on local anvil (chain-real citizen check)", () => {
  beforeAll(async () => {
    // Genesis-seed the witness as an existing on-chain citizen.
    deployment = await startAnvilWithContracts([getAddress(witness.address)]);

    vi.resetModules();
    mods = {
      attestation: await import("@/lib/passport/attestation"),
      rpcRoute: await import("@/app/api/rpc/[chain]/route"),
      submit: await import("@/app/api/applications/witnesses/submit/route"),
    };

    // Dispatch `/api/rpc/31337` browser fetches IN-PROCESS to the real proxy.
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/rpc/31337")) {
        const req = new Request("http://localhost:3000/api/rpc/31337", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: typeof init?.body === "string" ? init.body : "",
        });
        return mods.rpcRoute.POST(req, { params: Promise.resolve({ chain: "31337" }) });
      }
      return realFetch(input, init);
    });

    // DB: applicant User + verified wallet + application; witness User + verified wallet.
    const suffix = `${Date.now()}`;
    const au = await prisma.user.create({
      data: {
        email: `d4-applicant-${suffix}@w12.example`,
        linkedWallets: {
          create: { address: getAddress(applicant.address), chain: "EVM", verifiedAt: new Date() },
        },
        application: {
          create: {
            status: "OATH_ACCEPTED",
            name: NAME,
            applicantAddress: getAddress(applicant.address),
            witnessNonce: NONCE,
            witnessDeadline: DEADLINE,
          },
        },
      },
    });
    const wu = await prisma.user.create({
      data: {
        email: `d4-witness-${suffix}@w12.example`,
        linkedWallets: {
          create: { address: getAddress(witness.address), chain: "EVM", verifiedAt: new Date() },
        },
      },
    });
    applicantUserId = au.id;
    witnessUserId = wu.id;
    created.push(au.id, wu.id);
    ({ token: session } = await createSession(applicantUserId));
  }, 120_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (deployment) await deployment.stop();
    await prisma.referral.deleteMany({ where: { referrerUserId: witnessUserId } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("git", ["checkout", "--", "config/contracts.ts"], {
        cwd: join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
        stdio: "ignore",
      });
    } catch {
      /* best-effort */
    }
  });

  async function submitAsWitness(): Promise<Response> {
    const sig = await witness.signTypedData({
      domain: mods.attestation.attestationDomain(31337, deployment.passport as Address),
      types: mods.attestation.ATTESTATION_TYPES,
      primaryType: "Attestation",
      message: {
        applicant: getAddress(applicant.address),
        nameHash: mods.attestation.nameHashOf(NAME),
        nonce: BigInt(NONCE),
        deadline: BigInt(DEADLINE),
      },
    });
    const req = new Request("http://localhost:3000/api/applications/witnesses/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        cookie: `cr_session=${session}`,
      },
      body: JSON.stringify({
        attestation: {
          applicant: getAddress(applicant.address),
          nameHash: mods.attestation.nameHashOf(NAME),
          nonce: NONCE,
          deadline: DEADLINE,
        },
        signature: sig,
      }),
    });
    return mods.submit.POST(req);
  }

  it("rejects a citizen witness with NO referral (chain-real citizen check) — no row", async () => {
    const res = await submitAsWitness();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/only attest for applicants you have referred/i);
    const app = await prisma.citizenshipApplication.findUnique({ where: { userId: applicantUserId } });
    expect(await prisma.witnessSignature.count({ where: { applicationId: app!.id } })).toBe(0);
  }, 60_000);

  it("accepts the SAME citizen witness once they referred the applicant — a row is stored", async () => {
    await prisma.referral.create({
      data: { referrerUserId: witnessUserId, referredUserId: applicantUserId },
    });
    const res = await submitAsWitness();
    expect(res.status).toBe(200);
    const app = await prisma.citizenshipApplication.findUnique({ where: { userId: applicantUserId } });
    expect(await prisma.witnessSignature.count({ where: { applicationId: app!.id } })).toBe(1);
  }, 60_000);
});
