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
  statusAfterLimit,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET, POST } from "./route";
import { PUT, DELETE } from "./[ref]/route";

let f: AdminFixtures;
const REF = `T9-${Date.now() % 1_000_000}`;
const VALID = {
  ref: REF,
  kind: "re",
  name: "Test Warehouse",
  location: "Lisbon, PT",
  valueUsd: "28400000",
  yieldBps: 480,
  annualYieldUsd: "1363200",
  status: "OWNED",
  acquiredAt: "2026.01.01",
};

function itemParams(ref: string) {
  return { params: Promise.resolve({ ref }) };
}
function postAsset(o: { token?: string; origin?: string | null; body?: unknown }) {
  return POST(adminMutation("POST", "/api/admin/content/assets", o.body, o));
}
function putAsset(ref: string, body: unknown, o: { token?: string; origin?: string | null } = {}) {
  return PUT(adminMutation("PUT", `/api/admin/content/assets/${ref}`, body, o), itemParams(ref));
}
function delAsset(ref: string, o: { token?: string; origin?: string | null } = {}) {
  return DELETE(
    adminMutation("DELETE", `/api/admin/content/assets/${ref}`, undefined, o),
    itemParams(ref),
  );
}

describe("/api/admin/content/assets", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-assets");
    await prisma.assetCatalogEntry.deleteMany({ where: { ref: REF } });
  });

  beforeEach(() => __resetRateLimit());

  it("standard guard cases (401/401/403/403/400-strict)", async () => {
    expect(await standardGuardStatuses(postAsset, f, VALID)).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("PROVENANCE HONESTY (constraint #7): TITLED ON CHAIN / CR-L2 → 400", async () => {
    expect(
      (
        await postAsset({
          token: f.adminToken,
          body: { ...VALID, status: "OWNED · TITLED ON CHAIN" },
        })
      ).status,
    ).toBe(400);
    expect(
      (await postAsset({ token: f.adminToken, body: { ...VALID, location: "Chain · CR-L2" } }))
        .status,
    ).toBe(400);
    expect(await prisma.assetCatalogEntry.count({ where: { ref: REF } })).toBe(0);
  });

  it("create → BigInt round-trip (valueUsd string in = string out) + content.asset.create audit", async () => {
    const res = await postAsset({ token: f.adminToken, body: VALID });
    expect(res.status).toBe(200);
    const raw = await res.text();
    expectNoSecretKeys(raw);
    const body = JSON.parse(raw) as { ok: boolean; asset: { valueUsd: string } };
    expect(body.asset.valueUsd).toBe("28400000");

    const list = await GET(adminGet("/api/admin/content/assets", f.adminToken));
    expect(list.status).toBe(200);
    const listed = (await list.json()) as {
      assets: Array<{ ref: string; valueUsd: string; annualYieldUsd: string }>;
    };
    const mine = listed.assets.find((a) => a.ref === REF)!;
    expect(mine.valueUsd).toBe("28400000");
    expect(mine.annualYieldUsd).toBe("1363200");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "content.asset.create", targetId: REF },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.targetType).toBe("ASSET");
    expect(audit!.beforeJson).toBeNull(); // create → after only
    expect((JSON.parse(audit!.afterJson!) as { valueUsd: string }).valueUsd).toBe("28400000");
  });

  it("duplicate ref → 400", async () => {
    expect((await postAsset({ token: f.adminToken, body: VALID })).status).toBe(400);
  });

  it("update → audits BOTH before and after; ref/path mismatch → 400; 404 unknown", async () => {
    const res = await putAsset(
      REF,
      { ...VALID, name: "Renamed Warehouse" },
      { token: f.adminToken },
    );
    expect(res.status).toBe(200);
    const row = await prisma.assetCatalogEntry.findUniqueOrThrow({ where: { ref: REF } });
    expect(row.name).toBe("Renamed Warehouse");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "content.asset.update", targetId: REF },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((JSON.parse(audit!.beforeJson!) as { name: string }).name).toBe("Test Warehouse");
    expect((JSON.parse(audit!.afterJson!) as { name: string }).name).toBe("Renamed Warehouse");

    expect(
      (await putAsset(REF, { ...VALID, ref: "T9-OTHER" }, { token: f.adminToken })).status,
    ).toBe(400);
    expect(
      (await putAsset("NOPE-1", { ...VALID, ref: "NOPE-1" }, { token: f.adminToken })).status,
    ).toBe(404);
  });

  it("provenance guard also fires on update", async () => {
    expect(
      (
        await putAsset(
          REF,
          { ...VALID, status: "OWNED · TITLED ON CHAIN" },
          { token: f.adminToken },
        )
      ).status,
    ).toBe(400);
  });

  it("delete → before preserved in the audit; 404 after", async () => {
    const res = await delAsset(REF, { token: f.adminToken });
    expect(res.status).toBe(200);
    expect(await prisma.assetCatalogEntry.count({ where: { ref: REF } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "content.asset.delete", targetId: REF },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.afterJson).toBeNull(); // delete → before only
    expect((JSON.parse(audit!.beforeJson!) as { ref: string }).ref).toBe(REF);
    expect((await delAsset(REF, { token: f.adminToken })).status).toBe(404);
  });

  it("429 after the admin-content limit (60/5min per admin)", async () => {
    expect(await statusAfterLimit((body) => postAsset({ token: f.adminToken, body }), 60)).toBe(
      429,
    );
  });

  afterAll(async () => {
    await prisma.assetCatalogEntry.deleteMany({ where: { ref: REF } });
    await prisma.auditLog.deleteMany({ where: { targetId: REF } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });
});
