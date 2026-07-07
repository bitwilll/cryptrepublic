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
import { GET } from "./route";
import { PATCH } from "./[id]/route";

/**
 * /api/admin/services/store (Wave 15 C). Real prisma. Moderation is NOT
 * deletion: remove sets status REMOVED, the row survives, and the reason +
 * the listing's content are preserved in the audit snapshots (the
 * comment-moderation precedent). Guard stack per the Wave-9 contract.
 */

let f: AdminFixtures;
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function itemParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function patchListing(id: string, o: { token?: string; origin?: string | null; body?: unknown }) {
  return PATCH(adminMutation("POST", `/api/admin/services/store/${id}`, o.body, o), itemParams(id));
}

async function seedListing(over: { title?: string; status?: string; description?: string } = {}) {
  return prisma.storeListing.create({
    data: {
      sellerUserId: f.userId,
      title: over.title ?? `Ceremonial flag ${suffix}`,
      description: over.description ?? "A hand-stitched Republic flag, never flown.",
      category: "COLLECTIBLES",
      priceCoin: "125",
      status: over.status ?? "ACTIVE",
    },
  });
}

describe("/api/admin/services/store", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-svc-store");
  });

  beforeEach(async () => {
    __resetRateLimit();
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: f.allIds } } });
    await prisma.storeListing.deleteMany({ where: { sellerUserId: { in: f.allIds } } });
  });

  afterAll(async () => {
    await prisma.storeListing.deleteMany({ where: { sellerUserId: { in: f.allIds } } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });

  it("PATCH: standard guard cases", async () => {
    const listing = await seedListing();
    expect(
      await standardGuardStatuses((o) => patchListing(listing.id, o), f, {
        action: "remove",
        reason: "Prohibited item.",
      }),
    ).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("GET requires an admin; returns ALL statuses with the seller select", async () => {
    await seedListing({ status: "ACTIVE" });
    await seedListing({ title: `Sold banner ${suffix}`, status: "SOLD" });
    expect((await GET(adminGet("/api/admin/services/store"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/services/store", f.userToken))).status).toBe(403);

    const res = await GET(adminGet("/api/admin/services/store", f.adminToken));
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoSecretKeys(text);
    const { listings } = JSON.parse(text) as {
      listings: Array<{ title: string; status: string; seller: { email: string } }>;
    };
    const mine = listings.filter((l) => l.seller.email === f.userEmail);
    expect(mine.map((l) => l.status).sort()).toEqual(["ACTIVE", "SOLD"]);
  });

  it("GET ?status= and ?q= filter; an unknown status is 400", async () => {
    await seedListing({ title: `Searchable spyglass ${suffix}`, status: "ACTIVE" });
    await seedListing({ title: `Withdrawn chair ${suffix}`, status: "WITHDRAWN" });

    const filtered = await GET(
      adminGet(`/api/admin/services/store?status=WITHDRAWN`, f.adminToken),
    );
    const wd = (await filtered.json()) as { listings: Array<{ status: string }> };
    expect(wd.listings.every((l) => l.status === "WITHDRAWN")).toBe(true);

    const searched = await GET(
      adminGet(`/api/admin/services/store?q=Searchable spyglass ${suffix}`, f.adminToken),
    );
    const sr = (await searched.json()) as { listings: Array<{ title: string }> };
    expect(sr.listings).toHaveLength(1);
    expect(sr.listings[0]!.title).toContain("Searchable spyglass");

    expect(
      (await GET(adminGet("/api/admin/services/store?status=BOGUS", f.adminToken))).status,
    ).toBe(400);
  });

  it("remove: sets REMOVED (row survives) + listing.remove audit with the reason and content", async () => {
    const listing = await seedListing();
    const res = await patchListing(listing.id, {
      token: f.adminToken,
      body: { action: "remove", reason: "Violates the trade ordinance." },
    });
    expect(res.status).toBe(200);
    expectNoSecretKeys(await res.text());

    const row = await prisma.storeListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.status).toBe("REMOVED"); // moderation, not deletion
    expect(row.title).toBe(listing.title);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "listing.remove", targetId: listing.id },
    });
    expect(audit.targetType).toBe("STORE_LISTING");
    expect(audit.actorUserId).toBe(f.adminId);
    const before = JSON.parse(audit.beforeJson!) as { status: string; description: string };
    expect(before.status).toBe("ACTIVE");
    expect(before.description).toMatch(/hand-stitched/); // what was said lives on
    const after = JSON.parse(audit.afterJson!) as { status: string; removedReason: string };
    expect(after.status).toBe("REMOVED");
    expect(after.removedReason).toBe("Violates the trade ordinance.");
  });

  it("400 on a short/missing reason or a non-remove action; the listing is untouched", async () => {
    const listing = await seedListing();
    for (const body of [
      { action: "remove", reason: "no" },
      { action: "remove" },
      { action: "delete", reason: "Prohibited item." },
    ]) {
      expect((await patchListing(listing.id, { token: f.adminToken, body })).status).toBe(400);
    }
    expect(
      (await prisma.storeListing.findUniqueOrThrow({ where: { id: listing.id } })).status,
    ).toBe("ACTIVE");
    expect(await prisma.auditLog.count({ where: { targetId: listing.id } })).toBe(0);
  });

  it("400 when the listing is already REMOVED; 404 for an unknown id", async () => {
    const removed = await seedListing({ status: "REMOVED" });
    const res = await patchListing(removed.id, {
      token: f.adminToken,
      body: { action: "remove", reason: "Twice removed." },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already removed/i);

    expect(
      (
        await patchListing("does-not-exist", {
          token: f.adminToken,
          body: { action: "remove", reason: "Ghost listing." },
        })
      ).status,
    ).toBe(404);
  });
});
