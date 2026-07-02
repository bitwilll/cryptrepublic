// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { readRoleTopologyServer } from "@/lib/admin/serverReads";
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

const mockedRead = vi.mocked(readRoleTopologyServer);

let f: AdminFixtures;

const TOPOLOGY_FIXTURE = {
  chainId: 31337,
  available: true,
  contracts: [
    {
      contract: "staking" as const,
      address: "0x00000000000000000000000000000000000000A1" as const,
      roles: [
        {
          role: "REWARDS_ADMIN_ROLE" as const,
          roleId: ("0x" + "11".repeat(32)) as `0x${string}`,
          holders: ["0x00000000000000000000000000000000000000AA" as const],
        },
      ],
    },
  ],
};

describe("GET /api/admin/chain/roles", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-chain-roles");
  });

  beforeEach(() => {
    __resetRateLimit();
    mockedRead.mockReset();
    mockedRead.mockResolvedValue(TOPOLOGY_FIXTURE);
  });

  it("401 without a cookie / 401 suspended / 403 role USER", async () => {
    expect((await GET(adminGet("/api/admin/chain/roles"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/chain/roles", f.suspendedAdminToken))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/chain/roles", f.userToken))).status).toBe(403);
  });

  it("maps the confirmed role topology through", async () => {
    const res = await GET(adminGet("/api/admin/chain/roles", f.adminToken));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(TOPOLOGY_FIXTURE);
  });

  it("unregistered default chain → 200 {available:false, contracts:[]} (graceful)", async () => {
    mockedRead.mockResolvedValue({ chainId: 84532, available: false, contracts: [] });
    const res = await GET(adminGet("/api/admin/chain/roles", f.adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { available: boolean; contracts: unknown[] };
    expect(body.available).toBe(false);
    expect(body.contracts).toEqual([]);
  });

  it("a serverReads REJECTION returns 200 {available:false} — never a 500", async () => {
    mockedRead.mockRejectedValue(new Error("rpc down"));
    const res = await GET(adminGet("/api/admin/chain/roles", f.adminToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { available: boolean; contracts: unknown[] };
    expect(body.available).toBe(false);
    expect(body.contracts).toEqual([]);
  });

  it("429 after the admin-chain limit (30/5min)", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await GET(adminGet("/api/admin/chain/roles", f.adminToken))).status).toBe(200);
    }
    expect((await GET(adminGet("/api/admin/chain/roles", f.adminToken))).status).toBe(429);
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
