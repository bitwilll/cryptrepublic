// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * STATIC footgun grep — a lint-style smoke check for OBVIOUS boundary
 * violations. It does NOT and CANNOT prove no secret reaches the network; the
 * authoritative guarantee is the runtime fetch-spy in `no-secret-to-fetch.test.ts`.
 */

const ROOT = join(__dirname, "..");

function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

function read(p: string): string {
  return readFileSync(p, "utf8");
}

const WALLET_IMPORT_RE = /from\s+["'](?:@\/lib\/wallet|\.{1,2}\/(?:[^"']*\/)?lib\/wallet)/;

describe("client-only wallet boundary (static)", () => {
  it("no server file imports lib/wallet", () => {
    const appFiles = walk(join(ROOT, "app"), (p) => /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p));
    const serverAppFiles = appFiles.filter((p) => /(route|layout|page|actions)\.(ts|tsx)$/.test(p));
    const middleware = walk(
      ROOT,
      (p) => /(^|\/)middleware\.ts$/.test(p) && !p.includes("node_modules"),
    );
    // lib modules that declare import "server-only"
    const libFiles = walk(join(ROOT, "lib"), (p) => /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p));
    const serverLibFiles = libFiles.filter((p) => /import\s+["']server-only["']/.test(read(p)));

    const serverFiles = [...serverAppFiles, ...middleware, ...serverLibFiles];
    const offenders = serverFiles.filter((p) => WALLET_IMPORT_RE.test(read(p)));
    expect(offenders).toEqual([]);
  });

  it('every lib/wallet module begins with import "client-only"', () => {
    const walletFiles = walk(
      join(ROOT, "lib", "wallet"),
      (p) => /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p),
    );
    expect(walletFiles.length).toBeGreaterThan(0);
    const missing = walletFiles.filter((p) => {
      const first =
        read(p)
          .split("\n")
          .find((l) => l.trim() !== "") ?? "";
      return !/import\s+["']client-only["']/.test(first);
    });
    expect(missing).toEqual([]);
  });

  it("any fetch() in lib/wallet/services targets only /api/* and never a secret identifier", () => {
    const serviceDir = join(ROOT, "lib", "wallet", "services");
    const files = walk(serviceDir, (p) => /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p));
    for (const p of files) {
      const src = read(p);
      // Every fetch("...") literal must target /api/ (viem transports use http("/api/..."))
      const fetchLiterals = [...src.matchAll(/fetch\(\s*(["'`])([^"'`]*)\1/g)];
      for (const m of fetchLiterals) {
        expect(m[2].startsWith("/api/")).toBe(true);
      }
      // No secret identifier passed straight to fetch / JSON.stringify to network.
      expect(/fetch\([^)]*\b(seed|entropy|privateKey|mnemonic)\b/.test(src)).toBe(false);
    }
  });
});
