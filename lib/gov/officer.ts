import "server-only";
import { prisma } from "@/lib/db";
import { REPORT_VERIFIER_OFFICES, type CivicOffice } from "@/lib/gov/types";

/**
 * Wave 17 — the bureaucracy's first delegated power. A sitting Protector or
 * Chief of Protectors may verify conduct reports. This helper is the ONLY
 * authority check offices ever grant; every other privilege remains
 * User.role. Returns the empowering office, or null.
 */
export async function activeVerifierOffice(userId: string): Promise<CivicOffice | null> {
  const appointment = await prisma.officeAppointment.findFirst({
    where: {
      userId,
      revokedAt: null,
      office: { in: REPORT_VERIFIER_OFFICES as readonly string[] as string[] },
    },
    orderBy: { appointedAt: "asc" },
    select: { office: true },
  });
  return (appointment?.office as CivicOffice | undefined) ?? null;
}
