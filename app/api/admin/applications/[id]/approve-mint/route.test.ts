// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getAddress } from "viem";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { nameHashOf, toBytes32String } from "@/lib/passport/attestation";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminMutation,
  expectNoSecretKeys,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { POST } from "./route";

/** Unique checksummed address per run (LinkedWallet.address is @unique). */
function randomAddress(): `0x${string}` {
  const hex = Array.from(
    { length: 40 },
    () => "0123456789abcdef"[Math.floor(Math.random() * 16)],
  ).join("");
  return getAddress(`0x${hex}`);
}

let f: AdminFixtures;
const verifiedAddress = randomAddress();
let verifiedApplicantId: string;
let verifiedAppId: string;
let walletlessApplicantId: string;
let walletlessAppId: string;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
function post(id: string, body?: unknown, opts: { token?: string; origin?: string | null } = {}) {
  return POST(
    adminMutation("POST", `/api/admin/applications/${id}/approve-mint`, body, opts),
    params(id),
  );
}

interface ApproveMintResponse {
  ok: boolean;
  alreadyCitizen: boolean;
  chainId: number;
  mintParams: { to: string; nameHash: string; motto: string; domicile: string };
}

describe("POST /api/admin/applications/[id]/approve-mint", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-approve-mint");
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    // The witness-FREE primary case: a VERIFIED wallet but applicantAddress==null
    // (the user never ran the witness flow — exactly whom the override serves).
    const verified = await prisma.user.create({
      data: {
        email: `adm-approve-mint-v-${suffix}@w10adm.example`,
        linkedWallets: {
          create: { address: verifiedAddress, chain: "EVM", verifiedAt: new Date() },
        },
        application: {
          create: {
            status: "OATH_ACCEPTED",
            name: "Ada Lovelace",
            motto: "code is law",
            domicileCity: "Neo Berlin",
            applicantAddress: null,
          },
        },
      },
      include: { application: true },
    });
    verifiedApplicantId = verified.id;
    verifiedAppId = verified.application!.id;

    const walletless = await prisma.user.create({
      data: {
        email: `adm-approve-mint-w-${suffix}@w10adm.example`,
        application: { create: { status: "OATH_ACCEPTED", name: "No Wallet" } },
      },
      include: { application: true },
    });
    walletlessApplicantId = walletless.id;
    walletlessAppId = walletless.application!.id;
  });

  beforeEach(() => __resetRateLimit());

  it("401 / 401-suspended / 403-role / 403-origin standard guard cases", async () => {
    expect((await post(verifiedAppId, {})).status).toBe(401);
    expect((await post(verifiedAppId, {}, { token: f.suspendedAdminToken })).status).toBe(401);
    expect((await post(verifiedAppId, {}, { token: f.userToken })).status).toBe(403);
    expect(
      (await post(verifiedAppId, {}, { token: f.adminToken, origin: "https://evil.example" }))
        .status,
    ).toBe(403);
  });

  it("404 for an unknown application id", async () => {
    expect((await post("nope", {}, { token: f.adminToken })).status).toBe(404);
  });

  it("CONSTRAINT #3: a body naming chain-cache/approval columns is 400 by strictness — nothing written", async () => {
    for (const bad of [
      { status: "SEALED" },
      { citizenTokenId: "1" },
      { sealTxHash: "0xdead" },
      { adminApprovedBy: "spoof" },
    ]) {
      expect(
        (await post(verifiedAppId, bad, { token: f.adminToken })).status,
        JSON.stringify(bad),
      ).toBe(400);
    }
    const app = await prisma.citizenshipApplication.findUniqueOrThrow({
      where: { id: verifiedAppId },
    });
    expect(app.status).toBe("OATH_ACCEPTED");
    expect(app.citizenTokenId).toBeNull();
    expect(app.adminApprovedAt).toBeNull();
  });

  it("400 when the applicant has NO verified wallet — nothing written, NO audit row", async () => {
    const res = await post(walletlessAppId, {}, { token: f.adminToken });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/no verified wallet/i);

    const app = await prisma.citizenshipApplication.findUniqueOrThrow({
      where: { id: walletlessAppId },
    });
    expect(app.adminApprovedAt).toBeNull();
    expect(app.adminApprovedBy).toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { action: "application.approve_mint", targetId: walletlessAppId },
    });
    expect(audit).toBeNull();
  });

  it("happy path: resolved verified wallet → 200 mintParams + adminApprovedAt/By set + ONE audit row", async () => {
    const res = await post(verifiedAppId, {}, { token: f.adminToken });
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoSecretKeys(text);
    const body = JSON.parse(text) as ApproveMintResponse;

    expect(body.ok).toBe(true);
    // Default test env: the chain is unregistered — the graceful read reports NOT a citizen.
    expect(body.alreadyCitizen).toBe(false);
    expect(typeof body.chainId).toBe("number");
    // The trusted destination: resolveApplicantAddress(userId), NEVER the stored column.
    expect(body.mintParams.to).toBe(verifiedAddress);
    expect(body.mintParams.nameHash).toBe(nameHashOf("Ada Lovelace"));
    expect(body.mintParams.motto).toBe(toBytes32String("code is law"));
    expect(body.mintParams.domicile).toBe(toBytes32String("Neo Berlin"));

    const app = await prisma.citizenshipApplication.findUniqueOrThrow({
      where: { id: verifiedAppId },
    });
    expect(app.adminApprovedAt).not.toBeNull();
    expect(app.adminApprovedBy).toBe(f.adminId);
    // The route NEVER writes chain-cache columns (chain-truth honesty).
    expect(app.status).toBe("OATH_ACCEPTED");
    expect(app.citizenTokenId).toBeNull();
    expect(app.sealTxHash).toBeNull();
    expect(app.sealedAt).toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { action: "application.approve_mint", targetId: verifiedAppId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].targetType).toBe("APPLICATION");
    expectNoSecretKeys((audits[0].beforeJson ?? "") + (audits[0].afterJson ?? ""));
    const after = JSON.parse(audits[0].afterJson!) as Record<string, unknown>;
    expect(after.adminApprovedBy).toBe(f.adminId);
    expect(typeof after.adminApprovedAt).toBe("string");
  });

  it("re-approve is an EVENT: a second POST 200s, refreshes the approval, audits AGAIN", async () => {
    const first = await prisma.citizenshipApplication.findUniqueOrThrow({
      where: { id: verifiedAppId },
    });
    const res = await post(verifiedAppId, undefined, { token: f.adminToken }); // empty body tolerated
    expect(res.status).toBe(200);

    const app = await prisma.citizenshipApplication.findUniqueOrThrow({
      where: { id: verifiedAppId },
    });
    expect(app.adminApprovedAt!.getTime()).toBeGreaterThanOrEqual(first.adminApprovedAt!.getTime());
    const audits = await prisma.auditLog.findMany({
      where: { action: "application.approve_mint", targetId: verifiedAppId },
    });
    expect(audits).toHaveLength(2);
  });

  it("429 after the admin-approve-mint limit (10/5min per admin)", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await post(verifiedAppId, { zz_filler: i }, { token: f.adminToken })).status).toBe(
        400,
      );
    }
    expect((await post(verifiedAppId, {}, { token: f.adminToken })).status).toBe(429);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { targetId: { in: [verifiedAppId, walletlessAppId] } },
    });
    await cleanupAdminFixtures(f, [verifiedApplicantId, walletlessApplicantId]);
    await prisma.$disconnect();
  });
});
