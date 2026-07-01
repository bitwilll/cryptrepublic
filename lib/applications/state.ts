/**
 * Off-chain citizenship application state machine (spec §7.4 / §9).
 *
 * DRAFT → ATTESTED → OATH_ACCEPTED → WITNESSED → SEALED
 *
 * Forward-only. A transition is legal when the target is the SAME step
 * (idempotent re-submit of attest/oath) or exactly ONE step forward. SEALED is
 * terminal.
 */
export type AppStatus = "DRAFT" | "ATTESTED" | "OATH_ACCEPTED" | "WITNESSED" | "SEALED";

export const APP_STATUS_ORDER: readonly AppStatus[] = [
  "DRAFT",
  "ATTESTED",
  "OATH_ACCEPTED",
  "WITNESSED",
  "SEALED",
];

export function canTransition(from: AppStatus, to: AppStatus): boolean {
  const fromIdx = APP_STATUS_ORDER.indexOf(from);
  const toIdx = APP_STATUS_ORDER.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  // same step (idempotent) or exactly +1
  return toIdx === fromIdx || toIdx === fromIdx + 1;
}

export function nextStatus(from: AppStatus): AppStatus | null {
  const idx = APP_STATUS_ORDER.indexOf(from);
  if (idx === -1 || idx >= APP_STATUS_ORDER.length - 1) return null;
  return APP_STATUS_ORDER[idx + 1] ?? null;
}
