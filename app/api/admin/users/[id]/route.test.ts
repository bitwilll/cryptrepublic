// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  expectNoSecretKeys,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET } from "./route";

let f: AdminFixtures;
let targetId: string;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

interface DetailBody {
  user: Record<string, unknown>;
  sessions: Array<Record<string, unknown>>;
  linkedWallets: Array<Record<string, unknown>>;
  application: {
    status: string;
    kycStatus: string;
    chainCache: {
      chainDerived: true;
      sealTxHash: string | null;
      citizenTokenId: string | null;
      sealedAt: string | null;
    };
  } | null;
}

describe("GET /api/admin/users/[id]", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-user-detail");
    const target = await prisma.user.create({
      data: {
        email: `adm-user-detail-target-${Date.now()}@ex.org`,
        name: "Target",
        linkedWallets: {
          create: {
            address: `0x${Date.now().toString(16).padStart(40, "a")}`.slice(0, 42),
            verifiedAt: new Date(),
          },
        },
        application: {
          create: { status: "WITNESSED", sealTxHash: "0xcafe", citizenTokenId: "7" },
        },
      },
    });
    targetId = target.id;
    await createSession(targetId, { userAgent: "TestAgent/1.0" });
  });

  beforeEach(() => __resetRateLimit());

  it("401 without a cookie", async () => {
    expect((await GET(adminGet(`/api/admin/users/${targetId}`), params(targetId))).status).toBe(
      401,
    );
  });

  it("401 for a suspended admin", async () => {
    const res = await GET(
      adminGet(`/api/admin/users/${targetId}`, f.suspendedAdminToken),
      params(targetId),
    );
    expect(res.status).toBe(401);
  });

  it("403 for role USER", async () => {
    const res = await GET(adminGet(`/api/admin/users/${targetId}`, f.userToken), params(targetId));
    expect(res.status).toBe(403);
  });

  it("404 for an unknown id", async () => {
    const res = await GET(adminGet(`/api/admin/users/nope`, f.adminToken), params("nope"));
    expect(res.status).toBe(404);
  });

  it("returns the allowlisted detail: sessions expose ONLY id/userAgent/ipHash/createdAt/expiresAt", async () => {
    const res = await GET(adminGet(`/api/admin/users/${targetId}`, f.adminToken), params(targetId));
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecretKeys(raw);
    const body = JSON.parse(raw) as DetailBody;
    expect(body.user.id).toBe(targetId);
    expect(body.sessions.length).toBe(1);
    expect(Object.keys(body.sessions[0]).sort()).toEqual(
      ["id", "userAgent", "ipHash", "createdAt", "expiresAt"].sort(),
    );
    expect(body.sessions[0].userAgent).toBe("TestAgent/1.0");
    expect(body.linkedWallets.length).toBe(1);
    expect(Object.keys(body.linkedWallets[0]).sort()).toEqual(
      ["address", "chain", "verifiedAt"].sort(),
    );
  });

  it("labels the application chain-cache fields chainDerived (not authoritative)", async () => {
    const res = await GET(adminGet(`/api/admin/users/${targetId}`, f.adminToken), params(targetId));
    const body = (await res.json()) as DetailBody;
    expect(body.application).not.toBeNull();
    expect(body.application!.status).toBe("WITNESSED");
    expect(body.application!.chainCache.chainDerived).toBe(true);
    expect(body.application!.chainCache.sealTxHash).toBe("0xcafe");
    expect(body.application!.chainCache.citizenTokenId).toBe("7");
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f, [targetId]);
    await prisma.$disconnect();
  });
});
