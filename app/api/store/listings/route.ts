import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { isStoreCategory } from "@/lib/services/types";
import { listingCreateSchema } from "@/lib/validation/store";
import { traderDisplayMap } from "@/lib/store/display";
import { MAX_ACTIVE_LISTINGS } from "@/lib/store/transitions";

const PAGE_SIZE = 24;

/**
 * GET /api/store/listings — the public storefront: ACTIVE listings, newest
 * first, optional ?category= and ?q= (title contains), cursor-paginated
 * (take 24, ?cursor=<lastId>). With ?mine=1 it becomes the SELLER's private
 * ledger instead: session-required, ALL their listings regardless of status
 * (incl. WITHDRAWN/SOLD/REMOVED) so the "My listings" tab can act on them.
 * Sellers display as "Citizen № N" (cached citizenTokenId) or "Applicant" —
 * never an email or address.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.searchParams.get("mine") === "1") {
    let userId: string;
    try {
      ({
        user: { id: userId },
      } = await requireSession(req));
    } catch (res) {
      if (res instanceof Response) return res;
      throw res;
    }
    const mine = await prisma.storeListing.findMany({
      where: { sellerUserId: userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { _count: { select: { inquiries: { where: { status: "OPEN" } } } } },
    });
    return json({
      listings: mine.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        category: l.category,
        priceCoin: l.priceCoin,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        openInquiries: l._count.inquiries,
      })),
    });
  }

  const rawCategory = url.searchParams.get("category");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const cursor = url.searchParams.get("cursor");
  if (rawCategory !== null && !isStoreCategory(rawCategory)) return badRequest("Unknown category.");

  const rows = await prisma.storeListing.findMany({
    where: {
      status: "ACTIVE",
      ...(rawCategory ? { category: rawCategory } : {}),
      ...(q ? { title: { contains: q } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const page = rows.slice(0, PAGE_SIZE);
  const nextCursor = rows.length > PAGE_SIZE ? page[page.length - 1]!.id : null;
  const sellers = await traderDisplayMap(page.map((l) => l.sellerUserId));

  return json({
    listings: page.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      category: l.category,
      priceCoin: l.priceCoin,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
      sellerDisplay: sellers.get(l.sellerUserId) ?? "Applicant",
    })),
    nextCursor,
  });
}

/**
 * POST /api/store/listings — file a new listing. Session + origin gated;
 * body validated by listingCreateSchema (title 4..80, description 20..2000,
 * category union, priceCoin decimal string 0 < p <= 10,000,000 with <= 2 dp,
 * stored VERBATIM — pricing intent only, settlement is peer-to-peer). Hard
 * cap: at most 20 ACTIVE listings per seller.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let sellerUserId: string;
  try {
    ({
      user: { id: sellerUserId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = listingCreateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");

  const activeCount = await prisma.storeListing.count({
    where: { sellerUserId, status: "ACTIVE" },
  });
  if (activeCount >= MAX_ACTIVE_LISTINGS) {
    return badRequest(
      `You already have ${MAX_ACTIVE_LISTINGS} active listings — withdraw one first.`,
    );
  }

  const listing = await prisma.storeListing.create({
    data: { sellerUserId, ...parsed.data },
  });

  return json({
    ok: true,
    listing: {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      priceCoin: listing.priceCoin,
      status: listing.status,
      createdAt: listing.createdAt.toISOString(),
    },
  });
}
