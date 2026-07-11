import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { json } from "@/lib/http/responses";
import { OFFICE_LABELS, officePrecedence, isCivicOffice } from "@/lib/gov/types";
import { traderDisplayMap } from "@/lib/store/display";

/**
 * GET /api/government (Wave 16) — the appointed government, visible to any
 * signed-in user. READ-ONLY: offices are honours + display only (they grant no
 * auth privilege; User.role stays the only gate). Returns:
 * - roster: every ACTIVE appointment (revokedAt null) in protocol precedence
 *   order (PM first), appointedAt ascending within an office. Holders display
 *   as their DECLARED CitizenshipApplication.name when present, else the
 *   cached "Citizen № N" (lib/store/display.ts — no chain call), else
 *   "Citizen". NEVER an email or a wallet address — those stay private.
 * - mine: the CALLER's own active appointments, same order.
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

  const rows = await prisma.officeAppointment.findMany({
    where: { revokedAt: null },
    select: {
      id: true,
      userId: true,
      office: true,
      portfolio: true,
      appointedAt: true,
    },
  });

  rows.sort((a, b) => {
    const pa = isCivicOffice(a.office) ? officePrecedence(a.office) : Number.MAX_SAFE_INTEGER;
    const pb = isCivicOffice(b.office) ? officePrecedence(b.office) : Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    const ta = a.appointedAt.getTime();
    const tb = b.appointedAt.getTime();
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Holder display: declared name > cached "Citizen № N" > "Citizen".
  const holderIds = [...new Set(rows.map((r) => r.userId))];
  const tokenDisplays = await traderDisplayMap(holderIds); // "Citizen № N" | "Applicant"
  const named =
    holderIds.length === 0
      ? []
      : await prisma.citizenshipApplication.findMany({
          where: { userId: { in: holderIds }, name: { not: null } },
          select: { userId: true, name: true },
        });
  const nameMap = new Map(named.map((a) => [a.userId, a.name]));
  const displayFor = (id: string): string => {
    const declared = nameMap.get(id)?.trim();
    if (declared) return declared;
    const token = tokenDisplays.get(id);
    if (token && token !== "Applicant") return token;
    return "Citizen";
  };

  const officeLabel = (office: string): string =>
    isCivicOffice(office) ? OFFICE_LABELS[office] : office;

  return json({
    roster: rows.map((r) => ({
      office: r.office,
      officeLabel: officeLabel(r.office),
      portfolio: r.portfolio,
      holder: { display: displayFor(r.userId) },
      appointedAt: r.appointedAt.toISOString(),
    })),
    mine: rows
      .filter((r) => r.userId === userId)
      .map((r) => ({
        office: r.office,
        officeLabel: officeLabel(r.office),
        portfolio: r.portfolio,
        appointedAt: r.appointedAt.toISOString(),
      })),
  });
}
