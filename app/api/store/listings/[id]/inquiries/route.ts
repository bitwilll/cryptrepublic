import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { inquiryCreateSchema } from "@/lib/validation/store";

/**
 * POST /api/store/listings/[id]/inquiries — a signed-in BUYER opens an
 * inquiry on an ACTIVE listing. Never the seller (400 — you cannot inquire
 * on your own listing), never on a non-ACTIVE listing (400; REMOVED/unknown
 * → 404), and at most ONE OPEN inquiry per buyer per listing (400 on a
 * duplicate). No payment is created anywhere — an inquiry is a message,
 * settlement stays peer-to-peer.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let buyerUserId: string;
  try {
    ({
      user: { id: buyerUserId },
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
  const parsed = inquiryCreateSchema.safeParse(body);
  if (!parsed.success) return badRequest();

  const listing = await prisma.storeListing.findUnique({ where: { id } });
  if (!listing || listing.status === "REMOVED") {
    return json({ error: "Listing not found." }, { status: 404 });
  }
  if (listing.sellerUserId === buyerUserId) {
    return badRequest("You cannot inquire on your own listing.");
  }
  if (listing.status !== "ACTIVE") {
    return badRequest("This listing is no longer active.");
  }

  const existing = await prisma.storeInquiry.findFirst({
    where: { listingId: listing.id, buyerUserId, status: "OPEN" },
    select: { id: true },
  });
  if (existing) {
    return badRequest("You already have an open inquiry on this listing.");
  }

  const inquiry = await prisma.storeInquiry.create({
    data: { listingId: listing.id, buyerUserId, message: parsed.data.message },
  });

  return json({
    ok: true,
    inquiry: {
      id: inquiry.id,
      message: inquiry.message,
      reply: inquiry.reply,
      status: inquiry.status,
      createdAt: inquiry.createdAt.toISOString(),
    },
  });
}
