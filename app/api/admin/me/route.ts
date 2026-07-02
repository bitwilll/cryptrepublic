import "server-only";
import { json } from "@/lib/http/responses";
import { guardAdminGet } from "@/lib/admin/routeGuard";
import { resolveApplicantAddress } from "@/lib/applications/applicant";

/**
 * GET /api/admin/me — the acting admin's identity + their OWN verified wallet,
 * SERVER-resolved (Wave 10 A4, addendum #1). Powers the composer's self-mint
 * "use MY verified address" fill and ApplicationDetail's self-mint note — an
 * admin's own destination is never purely client-typed. `verifiedAddress` is
 * `resolveApplicantAddress(actor.user.id)` (checksummed verified LinkedWallet,
 * or null when the admin has not linked+verified a wallet).
 */
export async function GET(req: Request): Promise<Response> {
  const actor = await guardAdminGet(req);
  if (actor instanceof Response) return actor;

  return json({
    userId: actor.user.id,
    verifiedAddress: await resolveApplicantAddress(actor.user.id),
  });
}
