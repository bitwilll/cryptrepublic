import "server-only";
import { resolveApplicantAddress } from "@/lib/applications/applicant";
import { nameHashOf, toBytes32String } from "@/lib/passport/attestation";

/**
 * Server-side builder of the ADMIN-MINT params from an application row (Wave
 * 10 A3). The mint destination is the TRUSTED resolution — the applicant's
 * verified `LinkedWallet` via `resolveApplicantAddress(userId)` — NEVER a
 * client-supplied address and NEVER the stale witness-request-time
 * `applicantAddress` column.
 *
 * The three bytes32 args are encoded BYTE-IDENTICALLY to the witnessed seal
 * path (MintFlow.tsx `seal()`): nameHash = nameHashOf(name);
 * motto/domicile = toBytes32String(value.trim().slice(0, 31)) — trim FIRST,
 * then slice (addendum #2), so an admin-minted passport decodes exactly like a
 * witnessed one (`decodeBytes32String`).
 */
export interface AdminMintParams {
  to: `0x${string}`; // resolveApplicantAddress(app.userId) — verified LinkedWallet
  nameHash: `0x${string}`; // nameHashOf(app.name)
  motto: `0x${string}`; // toBytes32String((app.motto ?? "").trim().slice(0, 31))
  domicile: `0x${string}`; // toBytes32String((app.domicileCity ?? "").trim().slice(0, 31))
}

/** null when the applicant has no verified wallet (no trusted destination). */
export async function buildAdminMintParams(app: {
  userId: string;
  name: string | null;
  motto: string | null;
  domicileCity: string | null;
}): Promise<AdminMintParams | null> {
  const to = await resolveApplicantAddress(app.userId);
  if (!to) return null;
  return {
    to,
    nameHash: nameHashOf(app.name ?? ""),
    motto: toBytes32String((app.motto ?? "").trim().slice(0, 31)),
    domicile: toBytes32String((app.domicileCity ?? "").trim().slice(0, 31)),
  };
}
