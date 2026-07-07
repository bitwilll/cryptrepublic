import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { LISTING_STATUSES } from "@/lib/services/types";

/**
 * GET /api/admin/services/store (Wave 15 C) — the store moderation table.
 * ALL statuses (moderation sees withdrawn/sold/removed history), newest first;
 * ?status= filters, ?q= substring-searches title + description. The seller is
 * a tiny PUBLIC select (id/email/name).
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length > 200) return badRequest("Search query too long.");

  if (statusRaw !== null && !(LISTING_STATUSES as readonly string[]).includes(statusRaw)) {
    return badRequest("Unknown status filter.");
  }

  const listings = await prisma.storeListing.findMany({
    where: {
      ...(statusRaw !== null ? { status: statusRaw } : {}),
      ...(q.length > 0
        ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { seller: { select: { id: true, email: true, name: true } } },
  });
  return json({ listings });
}
