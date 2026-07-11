/**
 * Wave 16 — civic offices + fundraising unions (Cabinet direction 2026-07-08).
 * String-column unions, mirroring lib/auth/types.ts conventions (SQLite/Postgres
 * portability). OFFICES ARE HONOURS + DISPLAY ONLY: they grant no auth
 * privilege — User.role (USER|ADMIN) remains the only authorization gate.
 */

export const CIVIC_OFFICES = [
  "PRIME_MINISTER",
  "CHIEF_MINISTER",
  "CHIEF_OF_PROTECTORS",
  "MINISTER",
  "SENATOR",
  "LEGISLATOR",
  "PROTECTOR",
] as const;

export type CivicOffice = (typeof CIVIC_OFFICES)[number];

/** Offices held by exactly ONE citizen at a time (enforced at appointment). */
export const UNIQUE_OFFICES: readonly CivicOffice[] = [
  "PRIME_MINISTER",
  "CHIEF_MINISTER",
  "CHIEF_OF_PROTECTORS",
];

/** Display labels, in order of precedence (protocol order for rosters). */
export const OFFICE_LABELS: Record<CivicOffice, string> = {
  PRIME_MINISTER: "Prime Minister",
  CHIEF_MINISTER: "Chief Minister",
  CHIEF_OF_PROTECTORS: "Chief of Protectors",
  MINISTER: "Minister",
  SENATOR: "Senator",
  LEGISLATOR: "Legislator",
  PROTECTOR: "Protector",
};

export function isCivicOffice(v: string): v is CivicOffice {
  return (CIVIC_OFFICES as readonly string[]).includes(v);
}

/** Protocol precedence for sorting rosters (lower = higher office). */
export function officePrecedence(office: CivicOffice): number {
  return CIVIC_OFFICES.indexOf(office);
}

// ── Fundraising ────────────────────────────────────────────────────────────

export const FUNDRAISING_STATUSES = [
  "SUBMITTED",
  "ACTIVE",
  "DECLINED",
  "CLOSED",
  "WITHDRAWN",
] as const;

export type FundraisingStatus = (typeof FUNDRAISING_STATUSES)[number];

export const PLEDGE_STATUSES = ["PLEDGED", "WITHDRAWN"] as const;

export type PledgeStatus = (typeof PLEDGE_STATUSES)[number];

export const PROJECT_CATEGORIES = [
  "INFRASTRUCTURE",
  "TECHNOLOGY",
  "EDUCATION",
  "CULTURE",
  "DEFENSE",
  "WELFARE",
  "OTHER",
] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export const PROJECT_CATEGORY_LABELS: Record<ProjectCategory, string> = {
  INFRASTRUCTURE: "Infrastructure",
  TECHNOLOGY: "Technology",
  EDUCATION: "Education",
  CULTURE: "Culture",
  DEFENSE: "Defense",
  WELFARE: "Welfare",
  OTHER: "Other",
};

/** Endorsements that mark a SUBMITTED project community-backed (witness rule echo). */
export const COMMUNITY_BACKED_THRESHOLD = 7;

/** A citizen may hold at most this many non-terminal fundraisers at once. */
export const MAX_OPEN_FUNDRAISERS_PER_CITIZEN = 1;

// ── Wave 17: connections, conversations, reports, referral links ──────────

export const CONNECTION_KINDS = ["FRIEND", "FAMILY"] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export const CONNECTION_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "REMOVED"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CONVERSATION_KINDS = ["DIRECT", "GROUP"] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const REPORT_STATUSES = ["SUBMITTED", "VERIFIED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Report categories mirror the Penal Code's five grades of offence. */
export const REPORT_CATEGORIES = [
  "CIVIC_NEGLIGENCE",
  "MISREPRESENTATION",
  "ATTESTATION_BREACH",
  "FRAUD_UPON_CITIZEN",
  "FRAUD_UPON_REPUBLIC",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  CIVIC_NEGLIGENCE: "Civic negligence (Grade I)",
  MISREPRESENTATION: "Misrepresentation (Grade II)",
  ATTESTATION_BREACH: "Breach of attestation (Grade III)",
  FRAUD_UPON_CITIZEN: "Fraud upon a citizen (Grade IV)",
  FRAUD_UPON_REPUBLIC: "Fraud upon the Republic (Grade V)",
};

export const PENAL_GRADES = ["I", "II", "III", "IV", "V"] as const;
export type PenalGrade = (typeof PENAL_GRADES)[number];

/** Penalty bands per grade, from the ratified Penal Code (documents registry).
 *  A verified report's penalty must lie INSIDE its grade's band (inclusive). */
export const PENAL_GRADE_BANDS: Record<PenalGrade, { min: number; max: number }> = {
  I: { min: -5, max: -1 },
  II: { min: -15, max: -5 },
  III: { min: -30, max: -15 },
  IV: { min: -60, max: -30 },
  V: { min: -100, max: -60 },
};

/** Grade V: "forfeiture of every office held" — verification revokes offices. */
export const OFFICE_FORFEITURE_GRADE: PenalGrade = "V";

/** Offices empowered to verify conduct reports (beside ADMIN). */
export const REPORT_VERIFIER_OFFICES: readonly CivicOffice[] = ["PROTECTOR", "CHIEF_OF_PROTECTORS"];

/** Creating a shareable referral link requires finalScore STRICTLY above this. */
export const REFERRAL_LINK_THRESHOLD = 65;
