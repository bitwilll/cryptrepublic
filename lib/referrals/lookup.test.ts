// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { resolveUserByWalletAddress, referralExists } from "./lookup";

/**
 * Referral lookup helpers (Wave 12 A2). resolveUserByWalletAddress is the
 * reverse of resolveApplicantAddress — it maps a recovered witness address back
 * to the User who VERIFIED it (a verified LinkedWallet only). referralExists
 * checks a directed referrer→referred edge.
 */

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
// A checksummed EVM address (anvil #1) and its lowercased form.
const ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ADDR_LOWER = ADDR.toLowerCase();
const UNVERIFIED = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

let ownerId: string;
let unverifiedOwnerId: string;
let referrerId: string;
let referredId: string;

beforeAll(async () => {
  const owner = await prisma.user.create({
    data: {
      email: `lookup-owner-${suffix}@w12.example`,
      linkedWallets: { create: { address: ADDR, chain: "EVM", verifiedAt: new Date() } },
    },
  });
  ownerId = owner.id;
  const uv = await prisma.user.create({
    data: {
      email: `lookup-unverified-${suffix}@w12.example`,
      linkedWallets: { create: { address: UNVERIFIED, chain: "EVM", verifiedAt: null } },
    },
  });
  unverifiedOwnerId = uv.id;
  const referrer = await prisma.user.create({ data: { email: `lookup-r1-${suffix}@w12.example` } });
  const referred = await prisma.user.create({ data: { email: `lookup-r2-${suffix}@w12.example` } });
  referrerId = referrer.id;
  referredId = referred.id;
  await prisma.referral.create({
    data: { referrerUserId: referrerId, referredUserId: referredId },
  });
});

afterAll(async () => {
  await prisma.referral.deleteMany({
    where: { OR: [{ referrerUserId: referrerId }, { referredUserId: referredId }] },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, unverifiedOwnerId, referrerId, referredId] } },
  });
  await prisma.$disconnect();
});

describe("resolveUserByWalletAddress", () => {
  it("maps a verified checksummed address to its owner userId", async () => {
    expect(await resolveUserByWalletAddress(ADDR)).toBe(ownerId);
  });

  it("normalizes a lowercased address to the same owner (checksum-insensitive)", async () => {
    expect(await resolveUserByWalletAddress(ADDR_LOWER)).toBe(ownerId);
  });

  it("returns null for an unknown address", async () => {
    expect(
      await resolveUserByWalletAddress("0x1111111111111111111111111111111111111111"),
    ).toBeNull();
  });

  it("returns null for an UNVERIFIED wallet (verifiedAt null never satisfies a referral)", async () => {
    expect(await resolveUserByWalletAddress(UNVERIFIED)).toBeNull();
  });
});

describe("referralExists", () => {
  it("true for an existing directed edge", async () => {
    expect(await referralExists(referrerId, referredId)).toBe(true);
  });

  it("false for the REVERSE direction (edges are directed)", async () => {
    expect(await referralExists(referredId, referrerId)).toBe(false);
  });

  it("false for a non-existent pair", async () => {
    expect(await referralExists(referrerId, "nope-user-id")).toBe(false);
  });
});
