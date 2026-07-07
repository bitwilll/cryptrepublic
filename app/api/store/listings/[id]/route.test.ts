// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET, PATCH } from "./route";

/**
 * /api/store/listings/[id] (Wave 15 store). Real prisma. Asserts the detail
 * contract (404 unknown/REMOVED; WITHDRAWN/SOLD stay visible; inquiries are
 * role-scoped — full thread ONLY for the seller, own inquiry ONLY for the
 * buyer, nothing for the public) and the PATCH state machine (origin 403 /
 * auth 401 / non-seller 403 / bad action 400 / illegal transition 400 /
 * ACTIVE→WITHDRAWN→ACTIVE and ACTIVE→SOLD happy paths / SOLD is terminal).
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sellerEmail = `store-d-s-${suffix}@w15store.example`;
const buyerEmail = `store-d-b-${suffix}@w15store.example`;
const strangerEmail = `store-d-x-${suffix}@w15store.example`;

let sellerId: string;
let buyerId: string;
let strangerId: string;
let sellerToken: string;
let buyerToken: string;
let listingId: string;

function getReq(id: string, opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/store/listings/${id}`, { headers });
}
function patchReq(id: string, body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/store/listings/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  const [seller, buyer, stranger] = await Promise.all([
    prisma.user.create({ data: { email: sellerEmail } }),
    prisma.user.create({ data: { email: buyerEmail } }),
    prisma.user.create({ data: { email: strangerEmail } }),
  ]);
  sellerId = seller.id;
  buyerId = buyer.id;
  strangerId = stranger.id;
  [{ token: sellerToken }, { token: buyerToken }] = await Promise.all([
    createSession(sellerId),
    createSession(buyerId),
  ]);
});

beforeEach(async () => {
  await prisma.storeListing.deleteMany({ where: { sellerUserId: sellerId } });
  const listing = await prisma.storeListing.create({
    data: {
      sellerUserId: sellerId,
      title: "Registry-grade fountain pen",
      description: "A fountain pen suitable for signing ratified documents in style.",
      category: "GOODS",
      priceCoin: "45.50",
    },
  });
  listingId = listing.id;
});

afterAll(async () => {
  await prisma.storeListing.deleteMany({ where: { sellerUserId: sellerId } });
  await prisma.user.deleteMany({ where: { id: { in: [sellerId, buyerId, strangerId] } } });
  await prisma.$disconnect();
});

describe("GET /api/store/listings/[id]", () => {
  it("404 for an unknown id and for a REMOVED listing", async () => {
    expect((await GET(getReq("nope"), ctx("nope"))).status).toBe(404);
    await prisma.storeListing.update({ where: { id: listingId }, data: { status: "REMOVED" } });
    expect((await GET(getReq(listingId), ctx(listingId))).status).toBe(404);
  });

  it("WITHDRAWN and SOLD listings remain visible", async () => {
    for (const status of ["WITHDRAWN", "SOLD"]) {
      await prisma.storeListing.update({ where: { id: listingId }, data: { status } });
      const res = await GET(getReq(listingId), ctx(listingId));
      expect(res.status).toBe(200);
      expect(((await res.json()) as { listing: { status: string } }).listing.status).toBe(status);
    }
  });

  it("public (no session) sees the listing but NO inquiries", async () => {
    await prisma.storeInquiry.create({
      data: { listingId, buyerUserId: buyerId, message: "Is the nib gold?" },
    });
    const res = await GET(getReq(listingId), ctx(listingId));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      listing: { title: string; priceCoin: string; sellerDisplay: string };
      viewerIsSeller: boolean;
      inquiries: unknown;
      myInquiry: unknown;
    };
    expect(data.listing.title).toBe("Registry-grade fountain pen");
    expect(data.listing.sellerDisplay).toBe("Applicant");
    expect(data.viewerIsSeller).toBe(false);
    expect(data.inquiries).toBeNull();
    expect(data.myInquiry).toBeNull();
  });

  it("a buyer sees ONLY their own inquiry + reply, never the thread", async () => {
    await prisma.storeInquiry.create({
      data: { listingId, buyerUserId: buyerId, message: "Is the nib gold?", reply: "It is." },
    });
    await prisma.storeInquiry.create({
      data: { listingId, buyerUserId: strangerId, message: "Would you take 40?" },
    });

    const res = await GET(getReq(listingId, { token: buyerToken }), ctx(listingId));
    const data = (await res.json()) as {
      viewerIsSeller: boolean;
      inquiries: unknown;
      myInquiry: { message: string; reply: string; status: string } | null;
    };
    expect(data.viewerIsSeller).toBe(false);
    expect(data.inquiries).toBeNull();
    expect(data.myInquiry?.message).toBe("Is the nib gold?");
    expect(data.myInquiry?.reply).toBe("It is.");
  });

  it("the seller sees the FULL thread with buyer displays", async () => {
    await prisma.storeInquiry.create({
      data: { listingId, buyerUserId: buyerId, message: "Is the nib gold?" },
    });
    await prisma.storeInquiry.create({
      data: { listingId, buyerUserId: strangerId, message: "Would you take 40?" },
    });

    const res = await GET(getReq(listingId, { token: sellerToken }), ctx(listingId));
    const data = (await res.json()) as {
      viewerIsSeller: boolean;
      inquiries: Array<{ message: string; buyerDisplay: string }> | null;
    };
    expect(data.viewerIsSeller).toBe(true);
    expect(data.inquiries).toHaveLength(2);
    expect(data.inquiries!.every((i) => i.buyerDisplay === "Applicant")).toBe(true);
  });
});

describe("PATCH /api/store/listings/[id]", () => {
  it("403 on a foreign origin", async () => {
    const res = await PATCH(
      patchReq(
        listingId,
        { action: "withdraw" },
        { token: sellerToken, origin: "https://evil.example" },
      ),
      ctx(listingId),
    );
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await PATCH(patchReq(listingId, { action: "withdraw" }), ctx(listingId))).status).toBe(
      401,
    );
  });

  it("400 on a bad body (unknown action / extra key)", async () => {
    expect(
      (await PATCH(patchReq(listingId, { action: "burn" }, { token: sellerToken }), ctx(listingId)))
        .status,
    ).toBe(400);
    expect(
      (
        await PATCH(
          patchReq(listingId, { action: "withdraw", zz: 1 }, { token: sellerToken }),
          ctx(listingId),
        )
      ).status,
    ).toBe(400);
  });

  it("404 for an unknown id and for a REMOVED listing (moderation is not seller-reversible)", async () => {
    expect(
      (await PATCH(patchReq("nope", { action: "withdraw" }, { token: sellerToken }), ctx("nope")))
        .status,
    ).toBe(404);
    await prisma.storeListing.update({ where: { id: listingId }, data: { status: "REMOVED" } });
    expect(
      (
        await PATCH(
          patchReq(listingId, { action: "relist" }, { token: sellerToken }),
          ctx(listingId),
        )
      ).status,
    ).toBe(404);
  });

  it("403 for a signed-in non-seller", async () => {
    const res = await PATCH(
      patchReq(listingId, { action: "withdraw" }, { token: buyerToken }),
      ctx(listingId),
    );
    expect(res.status).toBe(403);
    const row = await prisma.storeListing.findUnique({ where: { id: listingId } });
    expect(row?.status).toBe("ACTIVE"); // untouched
  });

  it("walks the legal machine: ACTIVE→WITHDRAWN→ACTIVE, then ACTIVE→SOLD", async () => {
    const w = await PATCH(
      patchReq(listingId, { action: "withdraw" }, { token: sellerToken }),
      ctx(listingId),
    );
    expect(w.status).toBe(200);
    expect(((await w.json()) as { listing: { status: string } }).listing.status).toBe("WITHDRAWN");

    const r = await PATCH(
      patchReq(listingId, { action: "relist" }, { token: sellerToken }),
      ctx(listingId),
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as { listing: { status: string } }).listing.status).toBe("ACTIVE");

    const s = await PATCH(
      patchReq(listingId, { action: "mark-sold" }, { token: sellerToken }),
      ctx(listingId),
    );
    expect(s.status).toBe(200);
    const row = await prisma.storeListing.findUnique({ where: { id: listingId } });
    expect(row?.status).toBe("SOLD");
  });

  it("400 on every illegal transition (relist ACTIVE, withdraw WITHDRAWN, anything from SOLD)", async () => {
    expect(
      (
        await PATCH(
          patchReq(listingId, { action: "relist" }, { token: sellerToken }),
          ctx(listingId),
        )
      ).status,
    ).toBe(400);

    await prisma.storeListing.update({ where: { id: listingId }, data: { status: "WITHDRAWN" } });
    for (const action of ["withdraw", "mark-sold"]) {
      expect(
        (await PATCH(patchReq(listingId, { action }, { token: sellerToken }), ctx(listingId)))
          .status,
      ).toBe(400);
    }

    await prisma.storeListing.update({ where: { id: listingId }, data: { status: "SOLD" } });
    for (const action of ["withdraw", "mark-sold", "relist"]) {
      expect(
        (await PATCH(patchReq(listingId, { action }, { token: sellerToken }), ctx(listingId)))
          .status,
      ).toBe(400);
    }
  });
});
