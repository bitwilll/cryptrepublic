/**
 * PROVISIONAL (not-yet-on-chain) passport state, derived from the off-chain
 * CitizenshipApplication. Shared by the passport panel (/dashboard/passport)
 * and the dashboard home rail so both show the SAME honest pre-mint
 * look-and-feel once a user has applied. This is NEVER citizenship — the real
 * sealed passport renders only when the chain says citizen (readPassportStatus).
 */

/** The off-chain application shape surfaced by GET /api/applications. */
export interface AppInfo {
  status: string;
  name: string | null;
  domicileCity: string | null;
  motto: string | null;
  adminApprovedAt: string | null;
}

export const NEUTRAL = "—"; // em dash — the honest "not filled / unknown" placeholder

export interface Provisional {
  label: string;
  sublabel: string;
  cta: string;
}

/** null → no application → the plain mint CTA (never a passport card). */
export function deriveProvisional(app: AppInfo | null): Provisional | null {
  if (!app) return null;
  if (app.adminApprovedAt) {
    return {
      label: "TO BE MINTED",
      sublabel:
        "An administrator has approved your application — your passport is being issued by the Republic.",
      cta: "Open the mint flow →",
    };
  }
  if (app.status === "WITNESSED") {
    return {
      label: "TO BE MINTED",
      sublabel: "Your witnesses are collected — seal your passport on chain to finish.",
      cta: "Seal your passport →",
    };
  }
  if (app.status === "SEALED") {
    return {
      label: "AWAITING CHAIN CONFIRMATION",
      sublabel: "Your seal is recorded off-chain; waiting for the chain to confirm it.",
      cta: "Open the mint flow →",
    };
  }
  return {
    label: "PENDING · TO BE VERIFIED",
    sublabel:
      "Your application is in progress. Finish the steps to have your passport verified and minted.",
    cta: "Continue your application →",
  };
}

/** The name to show on a provisional preview: the declared name (uppercased) or a neutral fallback. */
export function provisionalName(app: AppInfo | null): string {
  const declared = (app?.name ?? "").trim();
  return declared ? declared.toUpperCase() : "PENDING CITIZEN";
}

/** The domicile line for a provisional preview (declared, or the neutral placeholder). */
export function provisionalDomicile(app: AppInfo | null): string {
  return (app?.domicileCity ?? "").trim() || NEUTRAL;
}

/** The motto line for a provisional preview (declared, or undefined so the row hides). */
export function provisionalMotto(app: AppInfo | null): string | undefined {
  return (app?.motto ?? "").trim() || undefined;
}
