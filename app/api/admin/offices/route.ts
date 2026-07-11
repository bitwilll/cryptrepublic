import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminGet, guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { assignOfficeSchema } from "@/lib/validation/offices";
import { traderDisplayMap } from "@/lib/store/display";
import { UNIQUE_OFFICES, isCivicOffice, officePrecedence } from "@/lib/gov/types";

/**
 * /api/admin/offices (Wave 16) — the protocol office's roster + appointments.
 *
 * GET  — the ACTIVE roster (revokedAt null) sorted by office precedence
 *        (PM → CM → COP → Ministers → Senators → Legislators → Protectors)
 *        then appointedAt. With ?q= (>= 2 chars) it ALSO returns up to 10
 *        user matches (email/name contains) with their current active
 *        offices, for the appointment form's search.
 * POST — appoint. Enforced IN THE TRANSACTION: (a) the same citizen cannot
 *        hold the same office twice (409); (b) a UNIQUE office (PM/CM/COP)
 *        with a different active holder is a 409 that names the holder — the
 *        desk must revoke first. Audit row in the same transaction.
 *
 * OFFICES ARE HONOURS + DISPLAY ONLY — they grant no auth privilege;
 * User.role remains the only authorization gate.
 */

const USER_PUBLIC = { select: { id: true, email: true, name: true } } as const;

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length > 200) return badRequest("Search query too long.");

  const roster = await prisma.officeAppointment.findMany({
    where: { revokedAt: null },
    include: { user: USER_PUBLIC },
  });
  roster.sort((a, b) => {
    const pa = isCivicOffice(a.office) ? officePrecedence(a.office) : Number.MAX_SAFE_INTEGER;
    const pb = isCivicOffice(b.office) ? officePrecedence(b.office) : Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return a.appointedAt.getTime() - b.appointedAt.getTime();
  });

  const rosterCitizens = await traderDisplayMap(roster.map((r) => r.userId));

  const payload: Record<string, unknown> = {
    roster: roster.map((r) => ({
      id: r.id,
      userId: r.userId,
      email: r.user.email,
      name: r.user.name,
      citizen: rosterCitizens.get(r.userId) ?? "Applicant",
      office: r.office,
      portfolio: r.portfolio,
      note: r.note,
      appointedAt: r.appointedAt.toISOString(),
      appointedBy: r.appointedBy,
    })),
  };

  if (q.length >= 2) {
    const users = await prisma.user.findMany({
      where: { OR: [{ email: { contains: q } }, { name: { contains: q } }] },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: {
        id: true,
        email: true,
        name: true,
        officeAppointments: {
          where: { revokedAt: null },
          select: { office: true, portfolio: true },
        },
      },
    });
    const matchCitizens = await traderDisplayMap(users.map((u) => u.id));
    payload.users = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      citizen: matchCitizens.get(u.id) ?? "Applicant",
      offices: u.officeAppointments,
    }));
  }

  return json(payload);
}

export async function POST(req: Request): Promise<Response> {
  const actor = await guardAdminMutation(req, {
    keyPrefix: "admin-offices",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (actor instanceof Response) return actor;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = assignOfficeSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Please check the appointment fields.");
  }
  const { userId, office, portfolio, note } = parsed.data;

  const appointee = await prisma.user.findUnique({ where: { id: userId }, ...USER_PUBLIC });
  if (!appointee) return json({ error: "Unknown citizen." }, { status: 404 });

  // Both seat checks live INSIDE the transaction so a concurrent appointment
  // cannot slip between check and create.
  const result = await prisma.$transaction(async (tx) => {
    const alreadyHeld = await tx.officeAppointment.findFirst({
      where: { userId, office, revokedAt: null },
    });
    if (alreadyHeld) return { conflict: "duplicate" as const };

    if (UNIQUE_OFFICES.includes(office)) {
      const holder = await tx.officeAppointment.findFirst({
        where: { office, revokedAt: null },
        include: { user: USER_PUBLIC },
      });
      if (holder) {
        return {
          conflict: "occupied" as const,
          holderEmail: holder.user.email ?? holder.userId,
        };
      }
    }

    const created = await tx.officeAppointment.create({
      data: {
        userId,
        office,
        portfolio: portfolio ?? null,
        note: note ?? null,
        appointedBy: actor.user.id,
      },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "office.appoint",
      targetType: "OFFICE_APPOINTMENT",
      targetId: created.id,
      after: created,
      userAgent: actor.userAgent,
    });
    return { created };
  });

  if ("conflict" in result) {
    if (result.conflict === "duplicate") {
      return json({ error: "This citizen already holds that office." }, { status: 409 });
    }
    return json(
      { error: `This seat is held by ${result.holderEmail} — revoke first.` },
      { status: 409 },
    );
  }

  const a = result.created;
  return json({
    ok: true,
    appointment: {
      id: a.id,
      userId: a.userId,
      office: a.office,
      portfolio: a.portfolio,
      note: a.note,
      appointedBy: a.appointedBy,
      appointedAt: a.appointedAt.toISOString(),
    },
  });
}
