// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

/**
 * POST /api/store/inquiries/[id]/reply (Wave 15 store). Real prisma.
 * Asserts: origin 403 / auth 401 / zod 400 (reply 1..1000, unknown keys) /
 * 404 for unknown ids AND for any non-seller caller (incl. the buyer — an
 * inquiry's existence is private) / CLOSED → 400 / happy path sets ANSWERED /
 * replying again amends the answer.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sellerEmail = `store-r-s-${suffix}@w15store.example`;
const buyerEmail = `store-r-b-${suffix}@w15store.example`;
const strangerEmail = `store-r-x-${suffix}@w15store.example`;

let sellerId: string;
let buyerId: string;
let strangerId: string;
let sellerToken: string;
let buyerToken: string;
let strangerToken: string;
let listingId: string;
let inquiryId: string;

function post(id: string, body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/store/inquiries/${id}/reply`, {
    method: "POST",
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
  [{ token: sellerToken }, { token: buyerToken }, { token: strangerToken }] = await Promise.all([
    createSession(sellerId),
    createSession(buyerId),
    createSession(strangerId),
  ]);
  const listing = await prisma.storeListing.create({
    data: {
      sellerUserId: sellerId,
      title: "Bound copy of the Constitution",
      description: "A cloth-bound printing of the ratified constitution, first edition.",
      category: "COLLECTIBLES",
      priceCoin: "75.00",
    },
  });
  listingId = listing.id;
});

beforeEach(async () => {
  await prisma.storeInquiry.deleteMany({ where: { listingId } });
  const inquiry = await prisma.storeInquiry.create({
    data: { listingId, buyerUserId: buyerId, message: "Does it include the amendments?" },
  });
  inquiryId = inquiry.id;
});

afterAll(async () => {
  await prisma.storeListing.deleteMany({ where: { sellerUserId: sellerId } });
  await prisma.user.deleteMany({ where: { id: { in: [sellerId, buyerId, strangerId] } } });
  await prisma.$disconnect();
});

describe("POST /api/store/inquiries/[id]/reply", () => {
  it("403 on a foreign origin", async () => {
    const res = await POST(
      post(inquiryId, { reply: "Yes." }, { token: sellerToken, origin: "https://evil.example" }),
      ctx(inquiryId),
    );
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await POST(post(inquiryId, { reply: "Yes." }), ctx(inquiryId))).status).toBe(401);
  });

  it("400 on a bad body (empty / long / extra key)", async () => {
    for (const body of [{ reply: "" }, { reply: "x".repeat(1001) }, { reply: "ok", zz: 1 }, {}]) {
      expect(
        (await POST(post(inquiryId, body, { token: sellerToken }), ctx(inquiryId))).status,
        JSON.stringify(body).slice(0, 40),
      ).toBe(400);
    }
  });

  it("404 for an unknown inquiry AND for any non-seller (buyer, stranger) — existence stays private", async () => {
    expect(
      (await POST(post("nope", { reply: "Yes." }, { token: sellerToken }), ctx("nope"))).status,
    ).toBe(404);
    for (const token of [buyerToken, strangerToken]) {
      const res = await POST(post(inquiryId, { reply: "Yes." }, { token }), ctx(inquiryId));
      expect(res.status).toBe(404);
    }
    const row = await prisma.storeInquiry.findUnique({ where: { id: inquiryId } });
    expect(row?.reply).toBeNull();
    expect(row?.status).toBe("OPEN");
  });

  it("400 when the inquiry is CLOSED", async () => {
    await prisma.storeInquiry.update({ where: { id: inquiryId }, data: { status: "CLOSED" } });
    const res = await POST(
      post(inquiryId, { reply: "Yes." }, { token: sellerToken }),
      ctx(inquiryId),
    );
    expect(res.status).toBe(400);
  });

  it("happy path: the seller's reply sets ANSWERED; replying again amends it", async () => {
    const res = await POST(
      post(inquiryId, { reply: "Yes, all amendments included." }, { token: sellerToken }),
      ctx(inquiryId),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      inquiry: { reply: string; status: string };
    };
    expect(data.ok).toBe(true);
    expect(data.inquiry.status).toBe("ANSWERED");
    expect(data.inquiry.reply).toBe("Yes, all amendments included.");

    const amend = await POST(
      post(
        inquiryId,
        { reply: "Correction: through the third amendment only." },
        { token: sellerToken },
      ),
      ctx(inquiryId),
    );
    expect(amend.status).toBe(200);
    const row = await prisma.storeInquiry.findUnique({ where: { id: inquiryId } });
    expect(row?.status).toBe("ANSWERED");
    expect(row?.reply).toBe("Correction: through the third amendment only.");
  });
});
