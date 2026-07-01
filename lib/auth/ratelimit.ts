import "server-only";

// ─────────────────────────────────────────────────────────────────────────────
// RATE-LIMIT POSTURE (Wave 2)
// DEV / SINGLE-INSTANCE ONLY. This limiter keeps its state in process-local memory
// (the `hits` Map below), which is NOT shared across instances and is lost on restart.
// It is sufficient for local dev and a single-instance deployment, but MUST be replaced
// with a shared store (Redis / Upstash) before any multi-instance production rollout.
// See spec §4.4, §4.9. Per-account lockout (lib/auth/lockout.ts) is the durable,
// DB-backed second layer that survives restarts and works across instances.
// ─────────────────────────────────────────────────────────────────────────────
const hits = new Map<string, number[]>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= limit) {
    const retryAfterSec = Math.ceil((recent[0] + windowMs - now) / 1000);
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterSec: 0 };
}

export function __resetRateLimit(): void {
  hits.clear();
}
