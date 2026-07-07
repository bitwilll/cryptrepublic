import "server-only";
import { prisma } from "@/lib/db";
import { requireSession, getSessionFromRequest } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { commissaryInterestSchema } from "@/lib/validation/commissary";
import { json, badRequest, forbidden } from "@/lib/http/responses";

/**
 * The Commissary register-of-interest (Wave 15).
 *
 * GET    — PUBLIC: aggregate interest count per catalogue item, plus `mine`
 *          (the caller's registered itemIds) when a session cookie is present.
 *          Read-only, no origin gate (same-origin GETs are CSRF-exempt).
 * POST   — requireSession + isAllowedOrigin; zod-validates { itemId } against
 *          lib/content/commissary.ts ids; UPSERTS on @@unique([userId,itemId])
 *          so a double-register is idempotent, never an error.
 * DELETE — requireSession + isAllowedOrigin; withdraws the caller's own row
 *          (deleteMany scoped to the session user — ownership by construction).
 *
 * Content-not-FK: itemIds live in the catalogue file, so validation is the
 * referential-integrity guard. All rows are PUBLIC data (a userId + itemId).
 */
export async function GET(req: Request): Promise<Response> {
  const grouped = await prisma.commissaryInterest.groupBy({
    by: ["itemId"],
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.itemId] = g._count._all;

  let mine: string[] = [];
  const session = await getSessionFromRequest(req);
  if (session) {
    const rows = await prisma.commissaryInterest.findMany({
      where: { userId: session.user.id },
      select: { itemId: true },
    });
    mine = rows.map((r) => r.itemId);
  }

  return json({ counts, mine });
}

export async function POST(req: Request): Promise<Response> {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = commissaryInterestSchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const { itemId } = parsed.data;

  await prisma.commissaryInterest.upsert({
    where: { userId_itemId: { userId, itemId } },
    create: { userId, itemId },
    update: {},
  });

  return json({ ok: true, itemId });
}

export async function DELETE(req: Request): Promise<Response> {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = commissaryInterestSchema.safeParse(body);
  if (!parsed.success) return badRequest();
  const { itemId } = parsed.data;

  // Scoped to the session user — a citizen can only withdraw their OWN interest.
  await prisma.commissaryInterest.deleteMany({ where: { userId, itemId } });

  return json({ ok: true, itemId });
}
