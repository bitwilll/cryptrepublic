import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { decideReportSchema } from "@/lib/validation/reports";
import { activeVerifierOffice } from "@/lib/gov/officer";
import { OFFICE_FORFEITURE_GRADE } from "@/lib/gov/types";
import { writeAudit } from "@/lib/admin/audit";

/**
 * POST /api/reports/[id]/decide (Wave 17) — verify or dismiss a SUBMITTED
 * conduct report. The decider is a sitting verifier officer (PROTECTOR /
 * CHIEF_OF_PROTECTORS — checked FIRST, so an admin who also holds the office
 * decides in that office) or an ADMIN; deciderOffice records which.
 *
 *   verify  → grade I..V + a penalty INSIDE the grade's Penal Code band + note
 *   dismiss → note optional
 *
 * Conflict of interest is a 403: nobody decides their own filing or a report
 * naming them as subject — admins included. ON VERIFY AT GRADE V the Penal
 * Code's forfeiture clause runs IN THE SAME TRANSACTION: every active
 * OfficeAppointment of the subject is revoked (revokedAt = decision time,
 * revokedBy = decider), with an OFFICE_APPOINTMENT audit row per seat. Every
 * decision — officer or admin — writes its CITIZEN_REPORT audit row in that
 * same transaction; the audit allowlist excludes the complaint body and the
 * reporter, so neither can reach a snapshot.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let user: User;
  try {
    ({ user } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const office = await activeVerifierOffice(user.id);
  const deciderOffice = office ?? (user.role === "ADMIN" ? "ADMIN" : null);
  if (!deciderOffice) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = decideReportSchema.safeParse(body);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom");
    return badRequest(
      custom?.message ?? parsed.error.issues[0]?.message ?? "Please check the decision fields.",
    );
  }
  const decision = parsed.data;
  const verify = decision.action === "verify";

  const { id } = await params;
  const before = await prisma.citizenReport.findUnique({ where: { id } });
  if (!before) return json({ error: "Not found." }, { status: 404 });

  // Conflict of interest — own filing or self-subject; applies to admins too.
  if (before.reporterUserId === user.id || before.subjectUserId === user.id) return forbidden();

  if (before.status !== "SUBMITTED") {
    return badRequest("This report has already been decided.");
  }

  const decidedAt = new Date();
  const note = decision.note?.trim() ? decision.note.trim() : null;
  const actorLabel = office ? `officer:${user.email ?? user.id}` : `admin:${user.email ?? user.id}`;
  const userAgent = req.headers.get("user-agent");

  const { after, forfeitedSeats } = await prisma.$transaction(async (tx) => {
    const updated = await tx.citizenReport.update({
      where: { id },
      data: {
        status: verify ? "VERIFIED" : "DISMISSED",
        grade: verify ? decision.grade : null,
        penalty: verify ? decision.penalty : null,
        note,
        decidedBy: user.id,
        deciderOffice,
        decidedAt,
      },
    });

    // Grade V — "forfeiture of every office held": revoke each active seat of
    // the subject, one OFFICE_APPOINTMENT audit row per seat, same transaction.
    let forfeitedSeats = 0;
    if (verify && decision.grade === OFFICE_FORFEITURE_GRADE) {
      const seats = await tx.officeAppointment.findMany({
        where: { userId: before.subjectUserId, revokedAt: null },
        orderBy: { appointedAt: "asc" },
      });
      for (const seat of seats) {
        const revoked = await tx.officeAppointment.update({
          where: { id: seat.id },
          data: { revokedAt: decidedAt, revokedBy: user.id },
        });
        await writeAudit(tx, {
          actorUserId: user.id,
          actorLabel,
          action: "office.forfeit",
          targetType: "OFFICE_APPOINTMENT",
          targetId: seat.id,
          before: seat,
          after: revoked,
          userAgent,
        });
        forfeitedSeats += 1;
      }
    }

    await writeAudit(tx, {
      actorUserId: user.id,
      actorLabel,
      action: verify ? "report.verify" : "report.dismiss",
      targetType: "CITIZEN_REPORT",
      targetId: id,
      before,
      after: updated,
      userAgent,
    });

    return { after: updated, forfeitedSeats };
  });

  return json({
    ok: true,
    report: {
      id: after.id,
      status: after.status,
      grade: after.grade,
      penalty: after.penalty,
      deciderOffice: after.deciderOffice,
      decidedAt: after.decidedAt === null ? null : after.decidedAt.toISOString(),
    },
    forfeitedSeats,
  });
}
