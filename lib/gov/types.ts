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
