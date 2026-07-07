import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { json } from "@/lib/http/responses";
import { traderDisplayMap } from "@/lib/store/display";

/**
 * GET /api/store/inquiries — the signed-in BUYER's own inquiries (the "My
 * inquiries" view): every listing they asked about with the seller's reply,
 * newest first. Strictly session-scoped — only the caller's rows.
 */
export async function GET(req: Request): Promise<Response> {
  let buyerUserId: string;
  try {
    ({
      user: { id: buyerUserId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const inquiries = await prisma.storeInquiry.findMany({
    where: { buyerUserId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      listing: {
        select: { id: true, title: true, priceCoin: true, status: true, sellerUserId: true },
      },
    },
  });
  const sellers = await traderDisplayMap(inquiries.map((i) => i.listing.sellerUserId));

  return json({
    inquiries: inquiries.map((i) => ({
      id: i.id,
      message: i.message,
      reply: i.reply,
      status: i.status,
      createdAt: i.createdAt.toISOString(),
      listing: {
        id: i.listing.id,
        title: i.listing.title,
        priceCoin: i.listing.priceCoin,
        status: i.listing.status,
        sellerDisplay: sellers.get(i.listing.sellerUserId) ?? "Applicant",
      },
    })),
  });
}
