import "server-only";
import { prisma } from "@/lib/db";
import { getSessionFromRequest, requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { listingPatchSchema } from "@/lib/validation/store";
import { traderDisplay, traderDisplayMap } from "@/lib/store/display";
import { nextListingStatus } from "@/lib/store/transitions";

function notFound(): Response {
  return json({ error: "Listing not found." }, { status: 404 });
}

/**
 * GET /api/store/listings/[id] — public detail for any listing EXCEPT
 * REMOVED (a Registry moderation state — 404, same as unknown). Inquiry
 * visibility is strictly role-scoped: the SELLER receives the full thread
 * list (with buyer displays); a signed-in BUYER receives only their own
 * inquiry + reply; the public receives neither.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!id) return badRequest();

  const listing = await prisma.storeListing.findUnique({ where: { id } });
  if (!listing || listing.status === "REMOVED") return notFound();

  const session = await getSessionFromRequest(req);
  const viewerId = session?.user.id ?? null;
  const viewerIsSeller = viewerId !== null && viewerId === listing.sellerUserId;

  const base = {
    listing: {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      priceCoin: listing.priceCoin,
      status: listing.status,
      createdAt: listing.createdAt.toISOString(),
      sellerDisplay: await traderDisplay(listing.sellerUserId),
    },
    viewerIsSeller,
  };

  if (viewerIsSeller) {
    const inquiries = await prisma.storeInquiry.findMany({
      where: { listingId: listing.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const buyers = await traderDisplayMap(inquiries.map((i) => i.buyerUserId));
    return json({
      ...base,
      inquiries: inquiries.map((i) => ({
        id: i.id,
        message: i.message,
        reply: i.reply,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
        buyerDisplay: buyers.get(i.buyerUserId) ?? "Applicant",
      })),
      myInquiry: null,
    });
  }

  let myInquiry = null;
  if (viewerId) {
    const mine = await prisma.storeInquiry.findFirst({
      where: { listingId: listing.id, buyerUserId: viewerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (mine) {
      myInquiry = {
        id: mine.id,
        message: mine.message,
        reply: mine.reply,
        status: mine.status,
        createdAt: mine.createdAt.toISOString(),
      };
    }
  }
  return json({ ...base, inquiries: null, myInquiry });
}

/**
 * PATCH /api/store/listings/[id] — the SELLER's state machine:
 * { action: "withdraw" | "mark-sold" | "relist" } for ACTIVE→WITHDRAWN,
 * ACTIVE→SOLD, WITHDRAWN→ACTIVE. Anything else (incl. anything from SOLD)
 * → 400. Non-seller → 403 (the listing itself is public). REMOVED → 404 —
 * moderation is never seller-reversible.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const { id } = await params;
  if (!id) return badRequest();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = listingPatchSchema.safeParse(body);
  if (!parsed.success) return badRequest();

  const listing = await prisma.storeListing.findUnique({ where: { id } });
  if (!listing || listing.status === "REMOVED") return notFound();
  if (listing.sellerUserId !== userId) return forbidden();

  const next = nextListingStatus(listing.status, parsed.data.action);
  if (!next) {
    return badRequest(
      `Cannot ${parsed.data.action.replace("-", " ")} a ${listing.status} listing.`,
    );
  }

  const updated = await prisma.storeListing.update({
    where: { id: listing.id },
    data: { status: next },
  });

  return json({
    ok: true,
    listing: {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      category: updated.category,
      priceCoin: updated.priceCoin,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}
