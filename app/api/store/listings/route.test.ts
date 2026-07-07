// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET, POST } from "./route";

/**
 * /api/store/listings (Wave 15 store). Real prisma against the local sqlite
 * db. Browse assertions are ISOLATED from parallel suites via a unique ?q=
 * token baked into every title this suite creates. Asserts: public browse
 * (ACTIVE only, newest first, category + q filters, 24-page cursor, seller
 * display from the CACHED citizenTokenId), ?mine=1 (session-scoped, all
 * statuses), and the create contract (origin 403 / auth 401 / zod 400s /
 * price-string rules / verbatim storage / 20-ACTIVE cap).
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const TOKEN = `zq${suffix.replace(/-/g, "")}`; // unique title token for ?q= isolation
const sellerEmail = `store-l-s-${suffix}@w15store.example`;
const otherEmail = `store-l-o-${suffix}@w15store.example`;

let sellerId: string;
let otherId: string;
let sellerToken: string;

function getReq(qs = "", opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/store/listings${qs}`, { headers });
}
function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/store/listings`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: `Ceremonial flag ${TOKEN}`,
    description: "A full-size ceremonial flag of the Republic, mint condition.",
    category: "GOODS",
    priceCoin: "128.00",
    ...overrides,
  };
}
async function seed(
  data: Partial<{
    title: string;
    category: string;
    status: string;
    priceCoin: string;
    sellerUserId: string;
    createdAt: Date;
  }> = {},
) {
  return prisma.storeListing.create({
    data: {
      sellerUserId: data.sellerUserId ?? sellerId,
      title: data.title ?? `Listing ${TOKEN}`,
      description: "Seeded listing for the store route test suite (long enough).",
      category: data.category ?? "GOODS",
      priceCoin: data.priceCoin ?? "10.00",
      status: data.status ?? "ACTIVE",
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    },
  });
}

beforeAll(async () => {
  const seller = await prisma.user.create({ data: { email: sellerEmail } });
  const other = await prisma.user.create({ data: { email: otherEmail } });
  sellerId = seller.id;
  otherId = other.id;
  ({ token: sellerToken } = await createSession(sellerId));
});

beforeEach(async () => {
  await prisma.storeListing.deleteMany({ where: { sellerUserId: { in: [sellerId, otherId] } } });
});

afterAll(async () => {
  await prisma.storeListing.deleteMany({ where: { sellerUserId: { in: [sellerId, otherId] } } });
  await prisma.citizenshipApplication.deleteMany({
    where: { userId: { in: [sellerId, otherId] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [sellerId, otherId] } } });
  await prisma.$disconnect();
});

describe("GET /api/store/listings (public browse)", () => {
  it("returns only ACTIVE listings, newest first, without a session", async () => {
    const t0 = Date.now() - 60_000;
    await seed({ title: `Old chair ${TOKEN}`, createdAt: new Date(t0) });
    await seed({ title: `New desk ${TOKEN}`, createdAt: new Date(t0 + 10_000) });
    await seed({ title: `Sold rug ${TOKEN}`, status: "SOLD", createdAt: new Date(t0 + 20_000) });
    await seed({
      title: `Hidden lamp ${TOKEN}`,
      status: "WITHDRAWN",
      createdAt: new Date(t0 + 30_000),
    });
    await seed({
      title: `Banned item ${TOKEN}`,
      status: "REMOVED",
      createdAt: new Date(t0 + 40_000),
    });

    const res = await GET(getReq(`?q=${TOKEN}`));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      listings: Array<{ title: string; status: string }>;
      nextCursor: string | null;
    };
    expect(data.listings.map((l) => l.title)).toEqual([`New desk ${TOKEN}`, `Old chair ${TOKEN}`]);
    expect(data.listings.every((l) => l.status === "ACTIVE")).toBe(true);
    expect(data.nextCursor).toBeNull();
  });

  it("filters by category and rejects an unknown category with 400", async () => {
    await seed({ title: `Notary service ${TOKEN}`, category: "SERVICES" });
    await seed({ title: `Iron stove ${TOKEN}`, category: "GOODS" });

    const res = await GET(getReq(`?q=${TOKEN}&category=SERVICES`));
    const data = (await res.json()) as { listings: Array<{ title: string }> };
    expect(data.listings.map((l) => l.title)).toEqual([`Notary service ${TOKEN}`]);

    expect((await GET(getReq(`?q=${TOKEN}&category=WEAPONS`))).status).toBe(400);
  });

  it("q matches on title only", async () => {
    await seed({ title: `Gilded frame ${TOKEN}` });
    const res = await GET(getReq(`?q=gilded%20frame%20${TOKEN}`));
    const data = (await res.json()) as { listings: Array<{ title: string }> };
    expect(data.listings).toHaveLength(1);

    const none = await GET(getReq(`?q=${TOKEN}nomatch`));
    expect(((await none.json()) as { listings: unknown[] }).listings).toHaveLength(0);
  });

  it("paginates 24 per page with a working cursor", async () => {
    const t0 = Date.now() - 100_000;
    for (let i = 0; i < 25; i++) {
      await seed({ title: `Bulk item ${i} ${TOKEN}`, createdAt: new Date(t0 + i * 1000) });
    }
    const first = await GET(getReq(`?q=${TOKEN}`));
    const p1 = (await first.json()) as {
      listings: Array<{ id: string; title: string }>;
      nextCursor: string | null;
    };
    expect(p1.listings).toHaveLength(24);
    expect(p1.nextCursor).toBe(p1.listings[23]!.id);
    expect(p1.listings[0]!.title).toBe(`Bulk item 24 ${TOKEN}`);

    const second = await GET(getReq(`?q=${TOKEN}&cursor=${p1.nextCursor}`));
    const p2 = (await second.json()) as {
      listings: Array<{ title: string }>;
      nextCursor: string | null;
    };
    expect(p2.listings).toHaveLength(1);
    expect(p2.listings[0]!.title).toBe(`Bulk item 0 ${TOKEN}`);
    expect(p2.nextCursor).toBeNull();
  });

  it("shows 'Citizen № N' for a sealed seller and 'Applicant' otherwise (cached tokenId, no chain)", async () => {
    await seed({ title: `Applicant item ${TOKEN}` });
    const res1 = await GET(getReq(`?q=${TOKEN}`));
    const d1 = (await res1.json()) as { listings: Array<{ sellerDisplay: string }> };
    expect(d1.listings[0]!.sellerDisplay).toBe("Applicant");

    await prisma.citizenshipApplication.create({
      data: { userId: sellerId, status: "MINTED", citizenTokenId: "42" },
    });
    const res2 = await GET(getReq(`?q=${TOKEN}`));
    const d2 = (await res2.json()) as { listings: Array<{ sellerDisplay: string }> };
    expect(d2.listings[0]!.sellerDisplay).toBe("Citizen № 42");
    await prisma.citizenshipApplication.deleteMany({ where: { userId: sellerId } });
  });
});

describe("GET /api/store/listings?mine=1 (seller ledger)", () => {
  it("401 without a session", async () => {
    expect((await GET(getReq("?mine=1"))).status).toBe(401);
  });

  it("returns ONLY my listings, all statuses included", async () => {
    await seed({ title: `Mine active ${TOKEN}` });
    await seed({ title: `Mine sold ${TOKEN}`, status: "SOLD" });
    await seed({ title: `Mine withdrawn ${TOKEN}`, status: "WITHDRAWN" });
    await seed({ title: `Theirs ${TOKEN}`, sellerUserId: otherId });

    const res = await GET(getReq("?mine=1", { token: sellerToken }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { listings: Array<{ title: string; status: string }> };
    expect(data.listings).toHaveLength(3);
    expect(new Set(data.listings.map((l) => l.status))).toEqual(
      new Set(["ACTIVE", "SOLD", "WITHDRAWN"]),
    );
    expect(data.listings.some((l) => l.title === `Theirs ${TOKEN}`)).toBe(false);
  });
});

describe("POST /api/store/listings", () => {
  it("403 on a foreign origin", async () => {
    const res = await POST(
      postReq(validBody(), { token: sellerToken, origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    expect((await POST(postReq(validBody()))).status).toBe(401);
  });

  it("400 on malformed JSON and on unknown keys", async () => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      origin: APP,
      cookie: `cr_session=${sellerToken}`,
    };
    const bad = new Request(`${APP}/api/store/listings`, {
      method: "POST",
      headers,
      body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);
    expect((await POST(postReq(validBody({ extra: 1 }), { token: sellerToken }))).status).toBe(400);
  });

  it("400 on title/description/category bounds", async () => {
    expect((await POST(postReq(validBody({ title: "abc" }), { token: sellerToken }))).status).toBe(
      400,
    );
    expect(
      (await POST(postReq(validBody({ title: "x".repeat(81) }), { token: sellerToken }))).status,
    ).toBe(400);
    expect(
      (await POST(postReq(validBody({ description: "too short" }), { token: sellerToken }))).status,
    ).toBe(400);
    expect(
      (await POST(postReq(validBody({ description: "x".repeat(2001) }), { token: sellerToken })))
        .status,
    ).toBe(400);
    expect(
      (await POST(postReq(validBody({ category: "WEAPONS" }), { token: sellerToken }))).status,
    ).toBe(400);
  });

  it("400 on every malformed or out-of-bounds price string", async () => {
    for (const priceCoin of [
      "0",
      "0.00",
      "-5",
      "1.234",
      ".50",
      "1,000",
      "1e3",
      "abc",
      "10000000.01",
      "10000001",
      "999999999",
      "",
    ]) {
      const res = await POST(postReq(validBody({ priceCoin }), { token: sellerToken }));
      expect(res.status, `priceCoin=${JSON.stringify(priceCoin)}`).toBe(400);
    }
  });

  it("happy path: creates an ACTIVE listing and stores the price string VERBATIM", async () => {
    for (const priceCoin of ["0.01", "9.5", "10000000", "128.00"]) {
      const res = await POST(postReq(validBody({ priceCoin }), { token: sellerToken }));
      expect(res.status, `priceCoin=${priceCoin}`).toBe(200);
      const data = (await res.json()) as {
        ok: boolean;
        listing: { id: string; status: string; priceCoin: string };
      };
      expect(data.ok).toBe(true);
      expect(data.listing.status).toBe("ACTIVE");
      expect(data.listing.priceCoin).toBe(priceCoin);
      const row = await prisma.storeListing.findUnique({ where: { id: data.listing.id } });
      expect(row?.priceCoin).toBe(priceCoin); // stored as given, never a float
      expect(row?.sellerUserId).toBe(sellerId);
    }
  });

  it("caps a seller at 20 ACTIVE listings (WITHDRAWN/SOLD do not count)", async () => {
    const t0 = Date.now() - 100_000;
    for (let i = 0; i < 20; i++) {
      await seed({ title: `Cap filler ${i} ${TOKEN}`, createdAt: new Date(t0 + i * 1000) });
    }
    const over = await POST(postReq(validBody(), { token: sellerToken }));
    expect(over.status).toBe(400);
    expect(((await over.json()) as { error: string }).error).toMatch(/active listings/i);

    // Freeing a slot (withdraw one) lets the next filing through.
    const one = await prisma.storeListing.findFirst({ where: { sellerUserId: sellerId } });
    await prisma.storeListing.update({ where: { id: one!.id }, data: { status: "WITHDRAWN" } });
    expect((await POST(postReq(validBody(), { token: sellerToken }))).status).toBe(200);
  });
});
