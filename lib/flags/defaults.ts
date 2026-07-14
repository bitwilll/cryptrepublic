/**
 * Feature-flag DECLARED defaults (Wave 9, constraint #8). Environment-NEUTRAL —
 * imported by the client hook, the server helper, route handlers, and tests.
 *
 * Resolution order (flagValue): DB row → declared default → false.
 * A missing row or a failed fetch degrades to the DECLARED default; an
 * undeclared key is OFF. Nothing here ever throws.
 */
export const FLAG_DEFAULTS: Record<string, boolean> = {
  // The ONE Wave-9 consumer (C3): gates the population world-map card.
  // Default TRUE = zero behavior change for every existing test/spec until an
  // admin flips it. Read-only presentational — not money-moving, not write-gating.
  population_world_map: true,
  // Registration policy (Cabinet control): the pair resolves to a tri-state —
  // OPEN (default, today's behavior), REFERRAL_ONLY (a valid referral code is
  // REQUIRED to register), CLOSED (no new registrations; sign-in unaffected).
  // Defaults keep OPEN so a missing row or DB failure never locks the door
  // by accident. Enforced SERVER-SIDE in /api/auth/register and the SIWE
  // wallet-native path; the auth form only mirrors it.
  registration_open: true,
  registration_referral_only: false,
};

export type RegistrationPolicy = "OPEN" | "REFERRAL_ONLY" | "CLOSED";

export function registrationPolicyFromFlags(
  open: boolean,
  referralOnly: boolean,
): RegistrationPolicy {
  if (!open) return "CLOSED";
  return referralOnly ? "REFERRAL_ONLY" : "OPEN";
}

export function flagValue(key: string, row?: { enabled: boolean } | null): boolean {
  return row?.enabled ?? FLAG_DEFAULTS[key] ?? false;
}
