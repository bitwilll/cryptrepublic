// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

/**
 * POST /api/store/listings/[id]/inquiries (Wave 15 store). Real prisma.
 * Asserts: origin 403 / auth 401 / zod 400 (message 4..1000, unknown keys) /
 * 404 unknown + REMOVED / 400 for the seller inquiring on their own listing /
 * 400 on a non-ACTIVE listing / ONE OPEN inquiry per buyer per listing (an
 * ANSWERED one does not block a new inquiry) / happy path creates OPEN.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sellerEmail = `store-i-s-${suffix}@w15store.example`;
const buyerEmail = `store-i-b-${suffix}@w15store.example`;

let sellerId: string;
let buyerId: string;
let sellerToken: string;
let buyerToken: string;
let listingId: string;

function post(id: string, body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/store/listings/${id}/inquiries`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const MSG = { message: "Is this still available for collection?" };

beforeAll(async () => {
  const [seller, buyer] = await Promise.all([
    prisma.user.create({ data: { email: sellerEmail } }),
    prisma.user.create({ data: { email: buyerEmail } }),
  ]);
  sellerId = seller.id;
  buyerId = buyer.id;
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
      title: "Surveyor's brass compass",
      description: "A well-kept brass compass from the founding survey of the Republic.",
      category: "COLLECTIBLES",
      priceCoin: "300",
    },
  });
  listingId = listing.id;
});

afterAll(async () => {
  await prisma.storeListing.deleteMany({ where: { sellerUserId: sellerId } });
  await prisma.user.deleteMany({ where: { id: { in: [sellerId, buyerId] } } });
  await prisma.$disconnect();
});

describe("POST /api/store/listings/[id]/inquiries", () => {
  it("403 on a foreign origin", async () => {
    const res = await POST(
      post(listingId, MSG, { token: buyerToken, origin: "https://evil.example" }),
      ctx(listingId),
    );
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await POST(post(listingId, MSG), ctx(listingId))).status).toBe(401);
  });

  it("400 on a bad body (short / long / extra key)", async () => {
    for (const body of [
      { message: "hi" },
      { message: "x".repeat(1001) },
      { message: "long enough message", zz: 1 },
      {},
    ]) {
      expect(
        (await POST(post(listingId, body, { token: buyerToken }), ctx(listingId))).status,
        JSON.stringify(body).slice(0, 40),
      ).toBe(400);
    }
  });

  it("404 for an unknown listing and for a REMOVED one", async () => {
    expect((await POST(post("nope", MSG, { token: buyerToken }), ctx("nope"))).status).toBe(404);
    await prisma.storeListing.update({ where: { id: listingId }, data: { status: "REMOVED" } });
    expect((await POST(post(listingId, MSG, { token: buyerToken }), ctx(listingId))).status).toBe(
      404,
    );
  });

  it("400 when the seller inquires on their own listing", async () => {
    const res = await POST(post(listingId, MSG, { token: sellerToken }), ctx(listingId));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/own listing/i);
  });

  it("400 on a WITHDRAWN or SOLD listing", async () => {
    for (const status of ["WITHDRAWN", "SOLD"]) {
      await prisma.storeListing.update({ where: { id: listingId }, data: { status } });
      const res = await POST(post(listingId, MSG, { token: buyerToken }), ctx(listingId));
      expect(res.status, status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/no longer active/i);
    }
  });

  it("happy path creates an OPEN inquiry; a duplicate OPEN one → 400; ANSWERED unblocks", async () => {
    const res = await POST(post(listingId, MSG, { token: buyerToken }), ctx(listingId));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      inquiry: { id: string; message: string; status: string; reply: string | null };
    };
    expect(data.ok).toBe(true);
    expect(data.inquiry.status).toBe("OPEN");
    expect(data.inquiry.reply).toBeNull();
    const row = await prisma.storeInquiry.findUnique({ where: { id: data.inquiry.id } });
    expect(row?.buyerUserId).toBe(buyerId);
    expect(row?.message).toBe(MSG.message);

    const dup = await POST(post(listingId, MSG, { token: buyerToken }), ctx(listingId));
    expect(dup.status).toBe(400);
    expect(((await dup.json()) as { error: string }).error).toMatch(/open inquiry/i);

    await prisma.storeInquiry.update({
      where: { id: data.inquiry.id },
      data: { status: "ANSWERED", reply: "Yes, it is." },
    });
    expect((await POST(post(listingId, MSG, { token: buyerToken }), ctx(listingId))).status).toBe(
      200,
    );
  });
});
