/**
 * Admin CSV report exporter (Wave 10, group B). PURE + environment-NEUTRAL —
 * deliberately NO `import "server-only"` so a node unit test imports it
 * directly. It builds a CSV string from an EXPLICIT per-report column ALLOWLIST:
 * only keys named in `columns` are ever emitted, so a row that happens to carry
 * `passwordHash`/`tokenHash` can NEVER leak into the output (those keys are not
 * in any export column set — mirroring the USER_SELECT / AUDIT_FIELD_ALLOWLIST
 * discipline in lib/admin/routeGuard.ts + lib/admin/audit.ts).
 *
 * FORMULA-INJECTION SAFE (OWASP CSV injection, constraint #5): a cell whose
 * string value begins with `=`, `+`, `-`, `@`, TAB, or CR is neutralized with a
 * leading apostrophe and always quoted, so a spreadsheet treats it as text.
 * Standard CSV quoting: a value containing `,` `"` `\n` or `\r` is wrapped in
 * double quotes with inner `"` doubled. Line terminator is `\r\n` (Excel).
 *
 * NON-CUSTODIAL note: this file (and its routes) never signs — it deliberately
 * uses `download`/`export`/`csv` identifiers and no signing/broadcast token
 * (test/no-admin-signing.test.ts forbids those substrings).
 */

export interface CsvColumn<T> {
  key: keyof T & string;
  header: string;
}

const NEEDS_QUOTE_RE = /[",\n\r]/;
const INJECTION_LEAD = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** Coerce any cell value to its CSV string form BEFORE quoting/neutralizing. */
function coerce(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return JSON.stringify(v); // defensive — objects/arrays
}

/** Quote per RFC-4180 + neutralize a formula-injection lead. */
function escapeCell(raw: string): string {
  const injection = raw.length > 0 && INJECTION_LEAD.has(raw[0]);
  const body = injection ? `'${raw}` : raw;
  if (injection || NEEDS_QUOTE_RE.test(body)) {
    return `"${body.replace(/"/g, '""')}"`;
  }
  return body;
}

/** Serialize rows to a CSV string using an EXPLICIT column allowlist. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => escapeCell(c.header)).join(","));
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(columns.map((c) => escapeCell(coerce(record[c.key]))).join(","));
  }
  return lines.map((l) => `${l}\r\n`).join("");
}

// ---------------------------------------------------------------------------
// Per-report column ALLOWLISTS. These are the ONLY fields any export can emit.
// Field sets mirror USER_SELECT (routeGuard) and AUDIT_FIELD_ALLOWLIST.APPLICATION
// (audit) — never passwordHash / session tokenHash.
// ---------------------------------------------------------------------------

export interface UserExportRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  kycStatus: string;
  suspendedAt: Date | null;
  lockedUntil: Date | null;
  failedLoginCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** == USER_SELECT (routeGuard) — NO passwordHash. */
export const USERS_EXPORT_COLUMNS: readonly CsvColumn<UserExportRow>[] = [
  { key: "id", header: "id" },
  { key: "email", header: "email" },
  { key: "name", header: "name" },
  { key: "role", header: "role" },
  { key: "kycStatus", header: "kycStatus" },
  { key: "suspendedAt", header: "suspendedAt" },
  { key: "lockedUntil", header: "lockedUntil" },
  { key: "failedLoginCount", header: "failedLoginCount" },
  { key: "createdAt", header: "createdAt" },
  { key: "updatedAt", header: "updatedAt" },
];

export interface ApplicationExportRow {
  id: string;
  userId: string;
  status: string;
  kycStatus: string;
  name: string | null;
  domicileCity: string | null;
  hostCountry: string | null;
  motto: string | null;
  applicantAddress: string | null;
  adminApprovedAt: Date | null;
  adminApprovedBy: string | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** PUBLIC application fields incl. the Wave-10 off-chain-intent columns. NO tokens. */
export const APPLICATIONS_EXPORT_COLUMNS: readonly CsvColumn<ApplicationExportRow>[] = [
  { key: "id", header: "id" },
  { key: "userId", header: "userId" },
  { key: "status", header: "status" },
  { key: "kycStatus", header: "kycStatus" },
  { key: "name", header: "name" },
  { key: "domicileCity", header: "domicileCity" },
  { key: "hostCountry", header: "hostCountry" },
  { key: "motto", header: "motto" },
  { key: "applicantAddress", header: "applicantAddress" },
  { key: "adminApprovedAt", header: "adminApprovedAt" },
  { key: "adminApprovedBy", header: "adminApprovedBy" },
  { key: "reviewNote", header: "reviewNote" },
  { key: "createdAt", header: "createdAt" },
  { key: "updatedAt", header: "updatedAt" },
];

export interface AuditExportRow {
  id: string;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: Date;
}

/** Audit rows. beforeJson/afterJson are ALREADY allowlist-serialized (audit.ts)
 *  so they carry no secret — safe to export verbatim. */
export const AUDIT_EXPORT_COLUMNS: readonly CsvColumn<AuditExportRow>[] = [
  { key: "id", header: "id" },
  { key: "actorLabel", header: "actorLabel" },
  { key: "action", header: "action" },
  { key: "targetType", header: "targetType" },
  { key: "targetId", header: "targetId" },
  { key: "beforeJson", header: "beforeJson" },
  { key: "afterJson", header: "afterJson" },
  { key: "createdAt", header: "createdAt" },
];
