import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { fileReportSchema } from "@/lib/validation/reports";
import { normalizeCivicId, getOrAssignCivicId } from "@/lib/identity/civicId";
import { OPEN_REPORT_CAP } from "@/lib/gov/types";

/**
 * Conduct reports (Wave 17) — citizen filing + the citizen's own record.
 *
 * PRIVACY IS THE FEATURE: a filing is addressed to a Civic ID (the anonymous
 * handle citizens hand out themselves) and the response confirms NOTHING about
 * the subject beyond acceptance of the filing — no email, no userId, no
 * display name. The reporter's identity never reaches the subject: only a
 * VERIFIED charge (category, grade, penalty, note) is disclosed to them.
 */

/**
 * POST /api/reports — file a conduct report against a Civic ID. Session +
 * origin gated; fileReportSchema (category union mirrors the Penal Code's
 * grades; body 20..2000). 404 for an unknown Civic ID, 400 for a self-report
 * and past the 3-open-reports cap. Creates a SUBMITTED report for the
 * Protectors' verification docket.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let reporterUserId: string;
  try {
    ({
      user: { id: reporterUserId },
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

  // Lenient input: normalize the Civic ID (case, dash variants) BEFORE the
  // schema's strict-format check so hand-typed ids still validate.
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    const raw = (body as Record<string, unknown>).subjectCivicId;
    if (typeof raw === "string") {
      const normalized = normalizeCivicId(raw);
      if (normalized) (body as Record<string, unknown>).subjectCivicId = normalized;
    }
  }
  const parsed = fileReportSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");
  const { subjectCivicId, category } = parsed.data;

  const subject = await prisma.user.findUnique({
    where: { civicId: subjectCivicId },
    select: { id: true },
  });
  if (!subject) return json({ error: "No citizen holds that Civic ID." }, { status: 404 });
  if (subject.id === reporterUserId) {
    return badRequest("You cannot file a conduct report against yourself.");
  }

  const openCount = await prisma.citizenReport.count({
    where: { reporterUserId, status: "SUBMITTED" },
  });
  if (openCount >= OPEN_REPORT_CAP) {
    return badRequest(
      `You already have ${OPEN_REPORT_CAP} reports awaiting verification — wait for a decision first.`,
    );
  }

  const report = await prisma.citizenReport.create({
    data: {
      reporterUserId,
      subjectUserId: subject.id,
      category,
      body: parsed.data.body,
    },
  });

  // Acceptance of the filing ONLY — nothing about the subject beyond the
  // Civic ID the reporter themselves supplied.
  return json({
    ok: true,
    report: {
      id: report.id,
      subjectCivicId,
      category: report.category,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
    },
  });
}

/**
 * GET /api/reports — the citizen's two-sided record:
 *
 *   filed             — every report I filed (subject as CIVIC ID ONLY, status,
 *                       category, filed date; decidedAt + grade once decided —
 *                       NEVER the decision note, which belongs to the record
 *                       between the Republic and the subject);
 *   verifiedAgainstMe — VERIFIED charges against me (category, grade, penalty,
 *                       decidedAt, note — the citizen's right to see the charge).
 *                       SUBMITTED / DISMISSED reports against me stay invisible,
 *                       and the reporter's identity is never disclosed.
 */
export async function GET(req: Request): Promise<Response> {
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const [filedRows, againstRows] = await Promise.all([
    prisma.citizenReport.findMany({
      where: { reporterUserId: userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { subject: { select: { civicId: true } } },
    }),
    prisma.citizenReport.findMany({
      where: { subjectUserId: userId, status: "VERIFIED" },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
    }),
  ]);

  const filed = await Promise.all(
    filedRows.map(async (r) => ({
      id: r.id,
      subjectCivicId: r.subject.civicId ?? (await getOrAssignCivicId(r.subjectUserId)),
      category: r.category,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt === null ? null : r.decidedAt.toISOString(),
      grade: r.status === "VERIFIED" ? r.grade : null,
    })),
  );

  return json({
    filed,
    verifiedAgainstMe: againstRows.map((r) => ({
      id: r.id,
      category: r.category,
      grade: r.grade,
      penalty: r.penalty,
      note: r.note,
      decidedAt: r.decidedAt === null ? null : r.decidedAt.toISOString(),
    })),
  });
}
