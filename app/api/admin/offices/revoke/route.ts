import "server-only";
import { prisma } from "@/lib/db";
import { json, badRequest } from "@/lib/http/responses";
import { guardAdminMutation } from "@/lib/admin/routeGuard";
import { writeAudit } from "@/lib/admin/audit";
import { revokeOfficeSchema } from "@/lib/validation/offices";

/**
 * POST /api/admin/offices/revoke (Wave 16) — end an ACTIVE appointment.
 * Stamps revokedAt + revokedBy (the acting admin); an optional note replaces
 * the appointment note (the audit snapshot preserves the original). An
 * already-revoked appointment is a 400; an unknown id a 404. The update and
 * its audit row commit in ONE transaction (Wave 9 convention).
 */
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
  const parsed = revokeOfficeSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Please check the revocation fields.");
  }
  const { appointmentId, note } = parsed.data;

  const before = await prisma.officeAppointment.findUnique({ where: { id: appointmentId } });
  if (!before) return json({ error: "Not found." }, { status: 404 });
  if (before.revokedAt !== null) return badRequest("This appointment is already revoked.");

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.officeAppointment.update({
      where: { id: appointmentId },
      data: {
        revokedAt: new Date(),
        revokedBy: actor.user.id,
        ...(note !== undefined ? { note } : {}),
      },
    });
    await writeAudit(tx, {
      actorUserId: actor.user.id,
      actorLabel: actor.actorLabel,
      action: "office.revoke",
      targetType: "OFFICE_APPOINTMENT",
      targetId: appointmentId,
      before,
      after: updated,
      userAgent: actor.userAgent,
    });
    return updated;
  });

  return json({
    ok: true,
    appointment: {
      id: after.id,
      userId: after.userId,
      office: after.office,
      revokedAt: after.revokedAt === null ? null : after.revokedAt.toISOString(),
      revokedBy: after.revokedBy,
    },
  });
}
