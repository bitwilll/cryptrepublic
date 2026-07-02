// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getAddress } from "viem";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  expectNoSecretKeys,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET } from "./route";

/** Unique checksummed address per run (LinkedWallet.address is @unique). */
function randomAddress(): `0x${string}` {
  const hex = Array.from(
    { length: 40 },
    () => "0123456789abcdef"[Math.floor(Math.random() * 16)],
  ).join("");
  return getAddress(`0x${hex}`);
}

let f: AdminFixtures;
const adminWallet = randomAddress();

describe("GET /api/admin/me (acting admin identity + SERVER-resolved own verified wallet — addendum #1)", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-me");
  });

  beforeEach(() => __resetRateLimit());

  it("401 (no cookie) / 401 (suspended) / 403 (role USER)", async () => {
    expect((await GET(adminGet("/api/admin/me"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/me", f.suspendedAdminToken))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/me", f.userToken))).status).toBe(403);
  });

  it("returns the acting admin's userId + verifiedAddress:null when they have no verified wallet", async () => {
    const res = await GET(adminGet("/api/admin/me", f.adminToken));
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecretKeys(raw);
    const body = JSON.parse(raw) as { userId: string; verifiedAddress: string | null };
    expect(body.userId).toBe(f.adminId);
    expect(body.verifiedAddress).toBeNull();
  });

  it("returns the SERVER-resolved checksummed verified wallet once one exists (never client-typed)", async () => {
    await prisma.linkedWallet.create({
      data: {
        userId: f.adminId,
        address: adminWallet,
        chain: "EVM",
        verifiedAt: new Date(),
      },
    });
    const res = await GET(adminGet("/api/admin/me", f.adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; verifiedAddress: string | null };
    expect(body.userId).toBe(f.adminId);
    expect(body.verifiedAddress).toBe(adminWallet);
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
