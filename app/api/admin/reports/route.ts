import "server-only";
import type { CitizenReport } from "@prisma/client";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { traderDisplayMap } from "@/lib/store/display";
import { OFFICE_FORFEITURE_GRADE } from "@/lib/gov/types";

/**
 * GET /api/admin/reports (Wave 17) — the Conduct desk's three queues. Admins
 * see everything, including the reporter's email (unlike the officer docket,
 * where the reporter is withheld):
 *
 *   submitted — SUBMITTED reports awaiting a decision, oldest first;
 *   verified  — newest 50 VERIFIED charges, incl. grade / penalty / decider +
 *               office and whether the Grade-V forfeiture revoked seats;
 *   dismissed — newest 50 dismissals.
 *
 * Decisions POST to /api/reports/[id]/decide (the officer route's admin path) —
 * there is no separate admin decide endpoint.
 */

const PERSON_SELECT = {
  select: { id: true, email: true, name: true, civicId: true },
} as const;

type PersonRow = { id: string; email: string | null; name: string | null; civicId: string | null };
type ReportRow = CitizenReport & { reporter: PersonRow; subject: PersonRow };

function baseRow(r: ReportRow, displays: Map<string, string>) {
  return {
    id: r.id,
    category: r.category,
    status: r.status,
    body: r.body,
    grade: r.grade,
    penalty: r.penalty,
    note: r.note,
    deciderOffice: r.deciderOffice,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt === null ? null : r.decidedAt.toISOString(),
    reporter: { id: r.reporter.id, email: r.reporter.email, name: r.reporter.name },
    subject: {
      id: r.subject.id,
      email: r.subject.email,
      name: r.subject.name,
      civicId: r.subject.civicId,
    },
    subjectDisplay: displays.get(r.subjectUserId) ?? "Applicant",
  };
}

export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  const [submitted, verified, dismissed] = await Promise.all([
    prisma.citizenReport.findMany({
      where: { status: "SUBMITTED" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { reporter: PERSON_SELECT, subject: PERSON_SELECT },
    }),
    prisma.citizenReport.findMany({
      where: { status: "VERIFIED" },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
      take: 50,
      include: { reporter: PERSON_SELECT, subject: PERSON_SELECT },
    }),
    prisma.citizenReport.findMany({
      where: { status: "DISMISSED" },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
      take: 50,
      include: { reporter: PERSON_SELECT, subject: PERSON_SELECT },
    }),
  ]);

  const displays = await traderDisplayMap(
    [...submitted, ...verified, ...dismissed].map((r) => r.subjectUserId),
  );

  // Decider labels (officers are ordinary citizens; the admin desk may see them).
  const deciderIds = [
    ...new Set(
      [...verified, ...dismissed].map((r) => r.decidedBy).filter((v): v is string => v !== null),
    ),
  ];
  const deciders = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: deciderIds } },
        select: { id: true, email: true },
      })
    ).map((u) => [u.id, u.email ?? u.id]),
  );

  // Grade-V forfeiture flag: seats revoked by THIS decision (same decider,
  // same timestamp — the decide route stamps both from one Date).
  const gradeV = verified.filter((r) => r.grade === OFFICE_FORFEITURE_GRADE);
  const revocations = await prisma.officeAppointment.findMany({
    where: {
      userId: { in: [...new Set(gradeV.map((r) => r.subjectUserId))] },
      revokedAt: { not: null },
    },
    select: { userId: true, revokedAt: true, revokedBy: true },
  });
  function forfeitedSeatsOf(r: ReportRow): number {
    if (r.grade !== OFFICE_FORFEITURE_GRADE || r.decidedAt === null) return 0;
    return revocations.filter(
      (a) =>
        a.userId === r.subjectUserId &&
        a.revokedBy === r.decidedBy &&
        a.revokedAt !== null &&
        a.revokedAt.getTime() === r.decidedAt!.getTime(),
    ).length;
  }

  return json({
    submitted: submitted.map((r) => baseRow(r, displays)),
    verified: verified.map((r) => {
      const forfeitedSeats = forfeitedSeatsOf(r);
      return {
        ...baseRow(r, displays),
        deciderLabel: (r.decidedBy !== null && deciders.get(r.decidedBy)) || r.decidedBy,
        forfeitedSeats,
        officesForfeited: forfeitedSeats > 0,
      };
    }),
    dismissed: dismissed.map((r) => ({
      ...baseRow(r, displays),
      deciderLabel: (r.decidedBy !== null && deciders.get(r.decidedBy)) || r.decidedBy,
    })),
  });
}
