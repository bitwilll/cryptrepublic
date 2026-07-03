// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * STATIC custody-boundary guard (Wave 11 C2/C5, Global Constraint #2):
 *  - the WATCH-ONLY half (build.ts, broadcast.ts) holds NO key: no signer
 *    symbol, no embedded import — and CRITICALLY no import of services/send
 *    (send.ts transitively imports embedded/session + embedded/derive, so a
 *    per-file symbol grep alone would pass while the module graph still pulls
 *    the whole signer into the watch-only bundle).
 *  - the shared services/call module is signer-free (defense in depth).
 *  - the OFFLINE-SIGNER half (sign.ts, C5) signs but can never broadcast: no
 *    sendRawTransaction, no /api/rpc, no broadcast import.
 */

const dir = __dirname;
const read = (f: string) => readFileSync(path.resolve(dir, f), "utf8");

const SIGNER_SYMBOLS =
  /requireSeed|withEvmSigner|evmSigner|unlockedSeed|signTransaction|mnemonicToSeed/;
const EMBEDDED_IMPORT = /from\s+"(@\/lib\/wallet\/embedded|\.\.\/embedded)/;
const SEND_IMPORT = /from\s+"(@\/lib\/wallet\/services\/send|\.\.\/services\/send|\.\/send)"/;

describe("custody boundary (static)", () => {
  for (const file of ["build.ts", "broadcast.ts"]) {
    it(`${file} holds NO key: no signer symbol, no embedded import, no send.ts import (transitive guard)`, () => {
      const src = read(file);
      expect(src, `${file} must not reference signer symbols`).not.toMatch(SIGNER_SYMBOLS);
      expect(src, `${file} must not import the embedded modules`).not.toMatch(EMBEDDED_IMPORT);
      expect(
        src,
        `${file} must not import services/send — it transitively pulls the embedded signer`,
      ).not.toMatch(SEND_IMPORT);
    });
  }

  it("services/call.ts (the shared tx-shape module) is signer-free", () => {
    const src = readFileSync(path.resolve(dir, "../services/call.ts"), "utf8");
    expect(src).not.toMatch(EMBEDDED_IMPORT);
    expect(src).not.toMatch(SIGNER_SYMBOLS);
  });

  it("sign.ts (the offline signer) can never broadcast", () => {
    const p = path.resolve(dir, "sign.ts");
    if (!existsSync(p)) return; // lands in C5; the assertion arms itself then
    const src = read(p);
    expect(src).not.toMatch(/sendRawTransaction/);
    expect(src).not.toMatch(/\/api\/rpc/);
    expect(src).not.toMatch(/from\s+"\.\/broadcast"/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });
});
