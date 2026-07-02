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
};

export function flagValue(key: string, row?: { enabled: boolean } | null): boolean {
  return row?.enabled ?? FLAG_DEFAULTS[key] ?? false;
}
