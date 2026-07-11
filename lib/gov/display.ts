import { OFFICE_LABELS, officePrecedence, type CivicOffice } from "@/lib/gov/types";

/**
 * Client-safe display helpers for civic offices (Wave 16). Pure string/array
 * work — no prisma, no server-only — shared by the /api/government route and
 * the population/home islands.
 */

/** "MINISTER" + "Treasury" → "Minister · Treasury"; no portfolio → "Minister". */
export function formatOfficeTitle(office: CivicOffice, portfolio?: string | null): string {
  const label = OFFICE_LABELS[office];
  const p = portfolio?.trim();
  return p ? `${label} · ${p}` : label;
}

export interface OfficeGroup<T> {
  office: CivicOffice;
  label: string;
  holders: T[];
}

/**
 * Group roster rows by office in protocol precedence order (PM first). Only
 * offices with at least one holder appear; input order within an office is
 * preserved (the API sorts by appointedAt ascending).
 */
export function groupRosterByOffice<T extends { office: CivicOffice }>(
  rows: T[],
): OfficeGroup<T>[] {
  const groups = new Map<CivicOffice, T[]>();
  for (const row of rows) {
    const list = groups.get(row.office);
    if (list) list.push(row);
    else groups.set(row.office, [row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => officePrecedence(a) - officePrecedence(b))
    .map(([office, holders]) => ({ office, label: OFFICE_LABELS[office], holders }));
}
