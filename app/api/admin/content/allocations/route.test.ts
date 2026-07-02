// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  adminMutation,
  expectNoSecretKeys,
  standardGuardStatuses,
  STANDARD_GUARD_EXPECTED,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET, POST } from "./route";
import { PUT, DELETE } from "./[bucket]/route";

let f: AdminFixtures;
const BUCKET = "test_wave9_bucket";
const BUCKET32 = "a".repeat(32); // 32-char boundary — must stay encodable as bytes32

function itemParams(bucket: string) {
  return { params: Promise.resolve({ bucket }) };
}
function postAlloc(o: { token?: string; origin?: string | null; body?: unknown }) {
  return POST(adminMutation("POST", "/api/admin/content/allocations", o.body, o));
}
function putAlloc(bucket: string, body: unknown, o: { token?: string } = {}) {
  return PUT(
    adminMutation("PUT", `/api/admin/content/allocations/${bucket}`, body, o),
    itemParams(bucket),
  );
}
function delAlloc(bucket: string, o: { token?: string } = {}) {
  return DELETE(
    adminMutation("DELETE", `/api/admin/content/allocations/${bucket}`, undefined, o),
    itemParams(bucket),
  );
}

/** targetBps headroom left by every OTHER row (the seeded table may already sum to 10000). */
async function headroomExcluding(bucket: string): Promise<number> {
  const others = await prisma.treasuryAllocation.findMany({
    where: { bucket: { not: bucket } },
    select: { targetBps: true },
  });
  return 10_000 - others.reduce((s, r) => s + r.targetBps, 0);
}

describe("/api/admin/content/allocations", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-alloc");
    await prisma.treasuryAllocation.deleteMany({ where: { bucket: { in: [BUCKET, BUCKET32] } } });
  });

  beforeEach(() => __resetRateLimit());

  it("standard guard cases", async () => {
    expect(
      await standardGuardStatuses(postAlloc, f, {
        bucket: BUCKET,
        label: "Test",
        targetBps: 0,
        color: "#fff",
      }),
    ).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("bucket regex boundary: 32-char [a-z0-9_] → 200; 33-char / uppercase / multi-byte → 400 (encodability)", async () => {
    const res = await postAlloc({
      token: f.adminToken,
      body: { bucket: BUCKET32, label: "Boundary", targetBps: 0, color: "#fff" },
    });
    expect(res.status).toBe(200);
    for (const bucket of ["a".repeat(33), "Embassy_Ops", "büdget"]) {
      expect(
        (
          await postAlloc({
            token: f.adminToken,
            body: { bucket, label: "Bad", targetBps: 0, color: "#fff" },
          })
        ).status,
      ).toBe(400);
    }
  });

  it("create at bps 0 + audit content.allocation.create", async () => {
    const res = await postAlloc({
      token: f.adminToken,
      body: { bucket: BUCKET, label: "Test Bucket", targetBps: 0, color: "#fff" },
    });
    expect(res.status).toBe(200);
    expectNoSecretKeys(await res.text());
    const audit = await prisma.auditLog.findFirst({
      where: { action: "content.allocation.create", targetId: BUCKET },
    });
    expect(audit).not.toBeNull();
    expect(audit!.targetType).toBe("ALLOCATION");
  });

  it("SUM RULE (constraint #7, AllocationOverflow mirror): exactly 10000 passes, 10001 → 400", async () => {
    const headroom = await headroomExcluding(BUCKET);
    expect(headroom).toBeGreaterThanOrEqual(0);

    // Push MY bucket to exactly the table-wide 10000 cap → allowed.
    const exact = await putAlloc(
      BUCKET,
      { bucket: BUCKET, label: "Test Bucket", targetBps: headroom, color: "#fff" },
      { token: f.adminToken },
    );
    expect(exact.status).toBe(200);
    expect(
      (await prisma.treasuryAllocation.findUniqueOrThrow({ where: { bucket: BUCKET } })).targetBps,
    ).toBe(headroom);

    // One bps more → the table would sum to 10001 → 400 (schema caps at 10000,
    // so when headroom is 10000 the +1 is caught by the schema instead — same 400).
    const over = await putAlloc(
      BUCKET,
      { bucket: BUCKET, label: "Test Bucket", targetBps: headroom + 1, color: "#fff" },
      { token: f.adminToken },
    );
    expect(over.status).toBe(400);

    // A CREATE that would overflow is rejected too (delete first to re-create).
    await delAlloc(BUCKET, { token: f.adminToken });
    const overCreate = await postAlloc({
      token: f.adminToken,
      body: { bucket: BUCKET, label: "Test Bucket", targetBps: headroom + 1, color: "#fff" },
    });
    expect(overCreate.status).toBe(400);
    expect(await prisma.treasuryAllocation.count({ where: { bucket: BUCKET } })).toBe(0);
  });

  it("update audits before+after; delete audits before; list serializes", async () => {
    await postAlloc({
      token: f.adminToken,
      body: { bucket: BUCKET, label: "Test Bucket", targetBps: 0, color: "#fff" },
    });
    await putAlloc(
      BUCKET,
      { bucket: BUCKET, label: "Renamed Bucket", targetBps: 0, color: "#000" },
      { token: f.adminToken },
    );
    const updateAudit = await prisma.auditLog.findFirst({
      where: { action: "content.allocation.update", targetId: BUCKET },
      orderBy: { createdAt: "desc" },
    });
    expect(updateAudit).not.toBeNull();
    expect((JSON.parse(updateAudit!.beforeJson!) as { label: string }).label).toBe("Test Bucket");
    expect((JSON.parse(updateAudit!.afterJson!) as { label: string }).label).toBe("Renamed Bucket");

    const list = await GET(adminGet("/api/admin/content/allocations", f.adminToken));
    const body = (await list.json()) as { allocations: Array<{ bucket: string }> };
    expect(body.allocations.some((a) => a.bucket === BUCKET)).toBe(true);

    expect((await delAlloc(BUCKET, { token: f.adminToken })).status).toBe(200);
    const delAudit = await prisma.auditLog.findFirst({
      where: { action: "content.allocation.delete", targetId: BUCKET },
    });
    expect(delAudit).not.toBeNull();
    expect((await delAlloc(BUCKET, { token: f.adminToken })).status).toBe(404);
  });

  afterAll(async () => {
    await prisma.treasuryAllocation.deleteMany({ where: { bucket: { in: [BUCKET, BUCKET32] } } });
    await prisma.auditLog.deleteMany({ where: { targetId: { in: [BUCKET, BUCKET32] } } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
