// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { prisma } from "@/lib/db";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET } from "./route";

/**
 * GET /api/admin/services/overview (Wave 15 C). Real prisma. Counts only.
 *
 * THE PRIVACY TEST IS THE POINT: BitWill directives are private instruments —
 * the response may carry their COUNT and nothing else. The suite seeds a real
 * directive with a beneficiary + memo + signature and asserts none of those
 * values (nor their field names) appear anywhere in the serialized body.
 *
 * Counts are asserted as >= / contains (the suite shares the sqlite db with
 * concurrently-running suites that also create rows).
 */

let f: AdminFixtures;
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ITEM_A = `w15-test-lapel-pin-${suffix}`;
const ITEM_B = `w15-test-flag-${suffix}`;
const SECRET_BENEFICIARY = `Beneficiary-Name-${suffix}`;
const SECRET_MEMO = `Every holding to the named heir ${suffix}.`;

let directiveSignature: string;
let directiveSigner: string;

describe("GET /api/admin/services/overview", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-svc-ovw");

    const account = privateKeyToAccount(generatePrivateKey());
    directiveSigner = account.address;
    directiveSignature = await account.signMessage({ message: SECRET_MEMO });

    await prisma.insuranceApplication.createMany({
      data: [
        { userId: f.userId, product: "ASSET", coverageNote: "Cover the workshop.", valueUsd: 10n },
        {
          userId: f.userId,
          product: "HEALTH",
          coverageNote: "Cover the citizen.",
          status: "APPROVED",
        },
      ],
    });
    await prisma.storeListing.createMany({
      data: [
        {
          sellerUserId: f.userId,
          title: `Overview flag ${suffix}`,
          description: "x",
          category: "GOODS",
          priceCoin: "1",
          status: "ACTIVE",
        },
        {
          sellerUserId: f.userId,
          title: `Overview relic ${suffix}`,
          description: "x",
          category: "GOODS",
          priceCoin: "2",
          status: "REMOVED",
        },
      ],
    });
    await prisma.commissaryInterest.createMany({
      data: [
        { userId: f.userId, itemId: ITEM_A },
        { userId: f.adminId, itemId: ITEM_A },
        { userId: f.userId, itemId: ITEM_B },
      ],
    });
    await prisma.bitwillDirective.createMany({
      data: [
        {
          ownerUserId: f.userId,
          beneficiaryName: SECRET_BENEFICIARY,
          beneficiaryContact: `heir-${suffix}@private.example`,
          beneficiaryAddress: directiveSigner,
          assetsMemo: SECRET_MEMO,
          directiveHash: `0x${"11".repeat(32)}`,
          signerAddress: directiveSigner,
          signature: directiveSignature,
          status: "ACTIVE",
        },
        {
          ownerUserId: f.userId,
          beneficiaryName: SECRET_BENEFICIARY,
          beneficiaryContact: `heir-${suffix}@private.example`,
          assetsMemo: SECRET_MEMO,
          directiveHash: `0x${"22".repeat(32)}`,
          signerAddress: directiveSigner,
          signature: directiveSignature,
          status: "REVOKED",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.bitwillDirective.deleteMany({ where: { ownerUserId: { in: f.allIds } } });
    await prisma.commissaryInterest.deleteMany({ where: { userId: { in: f.allIds } } });
    await prisma.storeListing.deleteMany({ where: { sellerUserId: { in: f.allIds } } });
    await prisma.insuranceApplication.deleteMany({ where: { userId: { in: f.allIds } } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });

  it("401 anonymous / 403 role user", async () => {
    expect((await GET(adminGet("/api/admin/services/overview"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/services/overview", f.userToken))).status).toBe(403);
  });

  it("returns the programme counts (insurance/listings by status, commissary top items, bitwill actives)", async () => {
    const res = await GET(adminGet("/api/admin/services/overview", f.adminToken));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      insurance: Record<string, number>;
      listings: Record<string, number>;
      commissary: Array<{ itemId: string; count: number }>;
      bitwill: { activeCount: number };
    };
    expect(data.insurance.SUBMITTED ?? 0).toBeGreaterThanOrEqual(1);
    expect(data.insurance.APPROVED ?? 0).toBeGreaterThanOrEqual(1);
    expect(data.listings.ACTIVE ?? 0).toBeGreaterThanOrEqual(1);
    expect(data.listings.REMOVED ?? 0).toBeGreaterThanOrEqual(1);

    const itemA = data.commissary.find((c) => c.itemId === ITEM_A);
    const itemB = data.commissary.find((c) => c.itemId === ITEM_B);
    expect(itemA?.count).toBe(2);
    expect(itemB?.count).toBe(1);
    expect(data.commissary.length).toBeLessThanOrEqual(10);

    // the REVOKED directive is not in force — only ACTIVE ones are counted
    expect(data.bitwill.activeCount).toBeGreaterThanOrEqual(1);
  });

  it("PRIVACY: no beneficiary field, memo, signature, or hash ever leaves the overview", async () => {
    const res = await GET(adminGet("/api/admin/services/overview", f.adminToken));
    const text = await res.text();

    // seeded VALUES must be absent
    expect(text).not.toContain(SECRET_BENEFICIARY);
    expect(text).not.toContain(SECRET_MEMO);
    expect(text).not.toContain(directiveSignature);
    expect(text).not.toContain(directiveSigner);
    expect(text).not.toContain(`heir-${suffix}@private.example`);

    // and so must the FIELD NAMES — the shape itself must not exist
    for (const field of [
      "beneficiaryName",
      "beneficiaryContact",
      "beneficiaryAddress",
      "assetsMemo",
      "directiveHash",
      "signerAddress",
      "signature",
    ]) {
      expect(text).not.toContain(field);
    }
  });
});
