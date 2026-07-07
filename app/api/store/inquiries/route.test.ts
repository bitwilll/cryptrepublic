// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET } from "./route";

/**
 * GET /api/store/inquiries (Wave 15 store) — the buyer's "My inquiries"
 * view. Real prisma. Asserts: 401 without a session; strictly session-scoped
 * (only the caller's rows); each row carries the listing summary + seller
 * display + the seller's reply; newest first.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const sellerEmail = `store-m-s-${suffix}@w15store.example`;
const buyerEmail = `store-m-b-${suffix}@w15store.example`;
const otherBuyerEmail = `store-m-o-${suffix}@w15store.example`;

let sellerId: string;
let buyerId: string;
let otherBuyerId: string;
let buyerToken: string;

function getReq(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/store/inquiries`, { headers });
}

beforeAll(async () => {
  const [seller, buyer, otherBuyer] = await Promise.all([
    prisma.user.create({ data: { email: sellerEmail } }),
    prisma.user.create({ data: { email: buyerEmail } }),
    prisma.user.create({ data: { email: otherBuyerEmail } }),
  ]);
  sellerId = seller.id;
  buyerId = buyer.id;
  otherBuyerId = otherBuyer.id;
  ({ token: buyerToken } = await createSession(buyerId));
  await prisma.citizenshipApplication.create({
    data: { userId: sellerId, status: "MINTED", citizenTokenId: "7" },
  });

  const t0 = Date.now() - 60_000;
  const listingA = await prisma.storeListing.create({
    data: {
      sellerUserId: sellerId,
      title: "Cartography lessons",
      description: "Six sessions on charting the territories of a network state.",
      category: "SERVICES",
      priceCoin: "60",
    },
  });
  const listingB = await prisma.storeListing.create({
    data: {
      sellerUserId: sellerId,
      title: "Engraved seal press",
      description: "A desk press for embossing the household seal on documents.",
      category: "GOODS",
      priceCoin: "210.00",
      status: "SOLD",
    },
  });
  await prisma.storeInquiry.create({
    data: {
      listingId: listingA.id,
      buyerUserId: buyerId,
      message: "Do lessons run on weekends?",
      createdAt: new Date(t0),
    },
  });
  await prisma.storeInquiry.create({
    data: {
      listingId: listingB.id,
      buyerUserId: buyerId,
      message: "Is the press still available?",
      reply: "Sold last week, apologies.",
      status: "ANSWERED",
      createdAt: new Date(t0 + 10_000),
    },
  });
  await prisma.storeInquiry.create({
    data: {
      listingId: listingA.id,
      buyerUserId: otherBuyerId,
      message: "Another buyer's question.",
      createdAt: new Date(t0 + 20_000),
    },
  });
});

afterAll(async () => {
  await prisma.storeListing.deleteMany({ where: { sellerUserId: sellerId } });
  await prisma.citizenshipApplication.deleteMany({ where: { userId: sellerId } });
  await prisma.user.deleteMany({ where: { id: { in: [sellerId, buyerId, otherBuyerId] } } });
  await prisma.$disconnect();
});

describe("GET /api/store/inquiries", () => {
  it("401 without a session", async () => {
    expect((await GET(getReq())).status).toBe(401);
  });

  it("returns ONLY my inquiries, newest first, with listing summary + seller display + reply", async () => {
    const res = await GET(getReq({ token: buyerToken }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      inquiries: Array<{
        message: string;
        reply: string | null;
        status: string;
        listing: { title: string; status: string; priceCoin: string; sellerDisplay: string };
      }>;
    };
    expect(data.inquiries).toHaveLength(2);
    expect(data.inquiries[0]!.message).toBe("Is the press still available?");
    expect(data.inquiries[0]!.reply).toBe("Sold last week, apologies.");
    expect(data.inquiries[0]!.status).toBe("ANSWERED");
    expect(data.inquiries[0]!.listing.title).toBe("Engraved seal press");
    expect(data.inquiries[0]!.listing.status).toBe("SOLD");
    expect(data.inquiries[0]!.listing.sellerDisplay).toBe("Citizen № 7");
    expect(data.inquiries[1]!.message).toBe("Do lessons run on weekends?");
    expect(data.inquiries[1]!.reply).toBeNull();
    expect(data.inquiries.some((i) => i.message === "Another buyer's question.")).toBe(false);
  });
});
