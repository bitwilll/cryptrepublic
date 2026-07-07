import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { inquiryReplySchema } from "@/lib/validation/store";

/**
 * POST /api/store/inquiries/[id]/reply — the LISTING SELLER answers an
 * inquiry (sets status ANSWERED; replying again amends the answer). An
 * inquiry is a private exchange, so a caller who is not the seller gets 404
 * — never confirmation that the inquiry id exists.
 */
export async function POST(
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
  const parsed = inquiryReplySchema.safeParse(body);
  if (!parsed.success) return badRequest();

  const inquiry = await prisma.storeInquiry.findUnique({
    where: { id },
    include: { listing: { select: { sellerUserId: true } } },
  });
  // 404 for unknown AND for not-the-seller: an inquiry is private, its
  // existence is not disclosed to anyone but the two parties.
  if (!inquiry || inquiry.listing.sellerUserId !== userId) {
    return json({ error: "Inquiry not found." }, { status: 404 });
  }
  if (inquiry.status === "CLOSED") {
    return badRequest("This inquiry is closed.");
  }

  const updated = await prisma.storeInquiry.update({
    where: { id: inquiry.id },
    data: { reply: parsed.data.reply, status: "ANSWERED" },
  });

  return json({
    ok: true,
    inquiry: {
      id: updated.id,
      message: updated.message,
      reply: updated.reply,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}
