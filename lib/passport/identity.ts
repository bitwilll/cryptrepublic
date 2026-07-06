/**
 * Deterministic passport identity art (Wave — passport polish). From a stable
 * seed (the holder's verified wallet address, or a name fallback) we derive a
 * UNIQUE generative identicon + a hex fingerprint for the "sovereign NFT" on the
 * passport reverse, and the value encoded in the front QR. Pure + deterministic
 * (a seeded PRNG, never Math.random) so the art is stable across renders/SSR.
 */

/** A stable seed for a holder: their address when known, else a name-derived key. */
export function passportSeed(identity: string | undefined | null, name: string): string {
  const id = (identity ?? "").trim();
  if (id) return id;
  const n = (name ?? "").trim().toLowerCase() || "pending-citizen";
  return `cr:${n}`;
}

/** FNV-1a 32-bit hash. */
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** A small deterministic xorshift PRNG seeded from a string. */
function seededRng(seed: string): () => number {
  let x = hash32(seed) || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0xffffffff;
  };
}

// On-brand palette (Republic blues + indigo) — one tone per identicon, sitting on
// the passport's light-blue reverse. Matches the website's blue accent.
const PALETTE = ["#1957d3", "#3b73de", "#0e3a9b", "#2b6cb0", "#5a86e0", "#1f4fb0"] as const;

export interface Identicon {
  /** A `size`×`size` symmetric on/off grid (mirrored across the vertical axis). */
  cells: boolean[][];
  /** The fill color for "on" cells. */
  color: string;
  size: number;
}

/** A GitHub-style symmetric identicon — unique + stable per seed. */
export function identicon(seed: string, size = 7): Identicon {
  const rng = seededRng(seed);
  const color = PALETTE[Math.floor(rng() * PALETTE.length) % PALETTE.length];
  const half = Math.ceil(size / 2);
  const cells: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row = new Array<boolean>(size).fill(false);
    for (let x = 0; x < half; x++) {
      const on = rng() > 0.5;
      row[x] = on;
      row[size - 1 - x] = on; // mirror
    }
    cells.push(row);
  }
  return { cells, color, size };
}

/** A 16-hex-char deterministic fingerprint (display only). */
export function fingerprint(seed: string): string {
  let out = "";
  let h = hash32(seed);
  for (let i = 0; i < 3; i++) {
    h = hash32(`${h}:${i}:${seed}`);
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 16).toUpperCase();
}
