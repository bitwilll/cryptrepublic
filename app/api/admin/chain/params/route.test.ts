// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { readAdminParamsServer } from "@/lib/admin/serverReads";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET } from "./route";

vi.mock("@/lib/admin/serverReads", () => ({
  readAdminParamsServer: vi.fn(),
  readRoleTopologyServer: vi.fn(),
}));

const mockedRead = vi.mocked(readAdminParamsServer);

let f: AdminFixtures;

const REGISTERED_FIXTURE = {
  chainId: 31337,
  available: true,
  addresses: { staking: "0x00000000000000000000000000000000000000A1" as const },
  staking: { aprBps: 1180, totalStaked: "1000", rewardPoolRemaining: "500" },
};

describe("GET /api/admin/chain/params", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-chain-params");
  });

  beforeEach(() => {
    __resetRateLimit();
    mockedRead.mockReset();
    mockedRead.mockResolvedValue(REGISTERED_FIXTURE);
  });

  it("401 without a cookie / 401 suspended / 403 role USER", async () => {
    expect((await GET(adminGet("/api/admin/chain/params"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/chain/params", f.suspendedAdminToken))).status).toBe(
      401,
    );
    expect((await GET(adminGet("/api/admin/chain/params", f.userToken))).status).toBe(403);
  });

  it("maps the serverReads shape through (addresses = the composer's source of truth)", async () => {
    const res = await GET(adminGet("/api/admin/chain/params", f.adminToken));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(REGISTERED_FIXTURE);
  });

  it("unregistered default chain → 200 {available:false} (graceful, never 500)", async () => {
    mockedRead.mockResolvedValue({ chainId: 84532, available: false, addresses: {} });
    const res = await GET(adminGet("/api/admin/chain/params", f.adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { available: boolean };
    expect(body.available).toBe(false);
  });

  it("a serverReads REJECTION returns 200 {available:false} — the route never re-throws a 500", async () => {
    mockedRead.mockRejectedValue(new Error("rpc down"));
    const res = await GET(adminGet("/api/admin/chain/params", f.adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { available: boolean; addresses: object };
    expect(body.available).toBe(false);
    expect(body.addresses).toEqual({});
  });

  it("429 after the admin-chain limit (30/5min — the reads scan logs)", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await GET(adminGet("/api/admin/chain/params", f.adminToken))).status).toBe(200);
    }
    expect((await GET(adminGet("/api/admin/chain/params", f.adminToken))).status).toBe(429);
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
