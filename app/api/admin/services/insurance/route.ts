import "server-only";
import type { InsuranceApplication } from "@prisma/client";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { insuranceStatusFilterSchema } from "@/lib/validation/estate";

/**
 * GET /api/admin/services/insurance (Wave 15 C) — the insurance review queue.
 * All citizens' applications, newest first, optionally filtered by ?status=.
 * The applicant is exposed via a tiny PUBLIC select (id/email/name) — never a
 * full user row. valueUsd (BigInt) is emitted as a string.
 */

type Row = InsuranceApplication & {
  user: { id: string; email: string | null; name: string | null };
};

function serialize(a: Row) {
  return { ...a, valueUsd: a.valueUsd === null ? null : a.valueUsd.toString() };
}

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const statusRaw = new URL(req.url).searchParams.get("status");
  let where: { status?: string } = {};
  if (statusRaw !== null) {
    const parsed = insuranceStatusFilterSchema.safeParse(statusRaw);
    if (!parsed.success) return badRequest("Unknown status filter.");
    where = { status: parsed.data };
  }

  const applications = await prisma.insuranceApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return json({ applications: applications.map(serialize) });
}
