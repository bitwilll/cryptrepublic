"use client";

/**
 * Deterministic SVG generators ported verbatim from the two IIFEs at the bottom
 * of Home.html. Same seed (20090103) and LCG so the output markup is identical.
 *
 * Both builders return the inner SVG HTML (the `<g>`/`<rect>` content) plus the
 * viewBox/attributes the parent <svg> should carry, so callers can render them
 * via dangerouslySetInnerHTML while keeping the outer <svg> in JSX.
 */

const SEED = 20090103;

/** Linear congruential generator matching Home.html exactly. */
function makeRnd(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

export interface GeneratedSvg {
  viewBox: string;
  /** Inner SVG markup for dangerouslySetInnerHTML. */
  html: string;
  /** Extra attributes the outer <svg> should carry (e.g. preserveAspectRatio). */
  preserveAspectRatio?: string;
}

/**
 * Deterministic QR-style verification glyph (decorative specimen).
 * n = 25, seed = 20090103.
 */
export function buildQrGlyph(): GeneratedSvg {
  const n = 25;
  const rnd = makeRnd(SEED);
  const finder = (ox: number, oy: number) =>
    `<rect x="${ox}" y="${oy}" width="7" height="7"/>` +
    `<rect x="${ox + 1}" y="${oy + 1}" width="5" height="5" fill="#fff"/>` +
    `<rect x="${ox + 2}" y="${oy + 2}" width="3" height="3"/>`;
  let cells = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
      if (!inFinder && rnd() > 0.52) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  const html =
    `<rect x="-1.5" y="-1.5" width="${n + 3}" height="${n + 3}" fill="#fff"/>` +
    `<g fill="#0a1929" shape-rendering="crispEdges">${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}${cells}</g>`;
  return { viewBox: `-1.5 -1.5 ${n + 3} ${n + 3}`, html };
}

/**
 * Generative soulbound NFT plate (deterministic, symmetric identicon).
 * n = 10, seed = 20090103, palette below.
 */
export function buildNftArt(): GeneratedSvg {
  const n = 10;
  const rnd = makeRnd(SEED);
  const pal = ["#c8a96a", "#1957d3", "#00b3e6", "#e8e0cc"];
  let cells = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n / 2; x++) {
      const on = rnd() > 0.46;
      if (!on) continue;
      const c = pal[Math.floor(rnd() * pal.length)];
      cells += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
      cells += `<rect x="${n - 1 - x}" y="${y}" width="1" height="1" fill="${c}"/>`;
    }
  }
  const html =
    `<rect width="${n}" height="${n}" fill="#081c33"/>` +
    `<g shape-rendering="crispEdges">${cells}</g>`;
  return { viewBox: `0 0 ${n} ${n}`, html, preserveAspectRatio: "xMidYMid meet" };
}

/** Convenience hook returning both deterministic art specimens. */
export function useGenerativeArt() {
  return { qr: buildQrGlyph(), nft: buildNftArt() };
}
