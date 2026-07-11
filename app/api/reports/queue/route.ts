import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { json, forbidden } from "@/lib/http/responses";
import { activeVerifierOffice } from "@/lib/gov/officer";
import { getOrAssignCivicId } from "@/lib/identity/civicId";
import { traderDisplayMap } from "@/lib/store/display";

/**
 * GET /api/reports/queue (Wave 17) — the Protectors' verification docket: the
 * bureaucracy's FIRST delegated power. 403 unless the caller holds an active
 * verifier office (PROTECTOR / CHIEF_OF_PROTECTORS via activeVerifierOffice —
 * the ONLY office-granted authority in the Republic).
 *
 * Returns SUBMITTED reports in filing order, EXCLUDING conflicts of interest
 * (reports the officer filed, and reports naming the officer as subject). The
 * officer sees the complaint body + the subject (Civic ID + public display),
 * but the REPORTER is withheld — complaints are weighed on their content, not
 * on who filed them.
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

  const office = await activeVerifierOffice(userId);
  if (!office) return forbidden();

  const rows = await prisma.citizenReport.findMany({
    where: {
      status: "SUBMITTED",
      NOT: [{ reporterUserId: userId }, { subjectUserId: userId }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { subject: { select: { civicId: true } } },
  });

  const displays = await traderDisplayMap(rows.map((r) => r.subjectUserId));
  const queue = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      category: r.category,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      subjectCivicId: r.subject.civicId ?? (await getOrAssignCivicId(r.subjectUserId)),
      subjectDisplay: displays.get(r.subjectUserId) ?? "Applicant",
      reporterDisplay: "Citizen (withheld)",
    })),
  );

  return json({ office, queue });
}
