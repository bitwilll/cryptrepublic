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
let needleId: string;
const NEEDLE = `zz-needle-${Date.now()}`;

interface UsersBody {
  users: Array<Record<string, unknown> & { id: string; email: string | null }>;
  page: number;
  pageSize: number;
  total: number;
}

describe("GET /api/admin/users", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-users-list");
    const needle = await prisma.user.create({
      data: { email: `${NEEDLE}@w9adm.example`, name: "Needle Person" },
    });
    needleId = needle.id;
    await createSession(needleId); // so _count.sessions is observable
  });

  beforeEach(() => __resetRateLimit());

  it("401 without a cookie", async () => {
    expect((await GET(adminGet("/api/admin/users"))).status).toBe(401);
  });

  it("401 for a suspended admin (choke point)", async () => {
    expect((await GET(adminGet("/api/admin/users", f.suspendedAdminToken))).status).toBe(401);
  });

  it("403 for role USER", async () => {
    expect((await GET(adminGet("/api/admin/users", f.userToken))).status).toBe(403);
  });

  it("lists select-allowlisted users — NEVER passwordHash/tokenHash in the serialized body", async () => {
    const res = await GET(adminGet(`/api/admin/users?q=${NEEDLE}`, f.adminToken));
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecretKeys(raw);
    const body = JSON.parse(raw) as UsersBody;
    expect(body.total).toBe(1);
    const row = body.users[0];
    expect(row.id).toBe(needleId);
    expect(row.email).toBe(`${NEEDLE}@w9adm.example`);
    expect(row.role).toBe("USER");
    expect(row.sessionCount).toBe(1);
    expect(Object.keys(row).sort()).toEqual(
      [
        "id",
        "email",
        "name",
        "role",
        "kycStatus",
        "suspendedAt",
        "lockedUntil",
        "failedLoginCount",
        "createdAt",
        "updatedAt",
        "sessionCount",
      ].sort(),
    );
  });

  it("q matches name substring too", async () => {
    const res = await GET(adminGet(`/api/admin/users?q=Needle Person`, f.adminToken));
    const body = (await res.json()) as UsersBody;
    expect(body.users.some((u) => u.id === needleId)).toBe(true);
  });

  it("paginates (pageSize=1 → one row + total intact)", async () => {
    const res = await GET(adminGet(`/api/admin/users?page=1&pageSize=1`, f.adminToken));
    const body = (await res.json()) as UsersBody;
    expect(body.users.length).toBe(1);
    expect(body.pageSize).toBe(1);
    expect(body.total).toBeGreaterThanOrEqual(4);
  });

  it("400 on invalid pagination", async () => {
    expect((await GET(adminGet(`/api/admin/users?page=0`, f.adminToken))).status).toBe(400);
    expect((await GET(adminGet(`/api/admin/users?pageSize=101`, f.adminToken))).status).toBe(400);
    expect((await GET(adminGet(`/api/admin/users?page=abc`, f.adminToken))).status).toBe(400);
  });

  afterAll(async () => {
    await cleanupAdminFixtures(f, [needleId]);
    await prisma.$disconnect();
  });
});
