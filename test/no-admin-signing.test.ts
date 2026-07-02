// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * STATIC NON-CUSTODIAL GUARD (Wave 9, constraint #1). The admin panel PREPARES
 * calldata and NEVER signs or broadcasts. Two rules over the whole admin
 * surface (lib/admin, app/admin, app/api/admin, components/admin):
 *
 *  1. FORBIDDEN TOKENS, matched CASE-INSENSITIVELY — catches viem's bare
 *     signing flow (walletClient.sendTransaction contains NO eth_-prefixed
 *     literal) and wagmi's hooks (useWriteContract/useSendTransaction match
 *     the bare names case-insensitively).
 *  2. FORBIDDEN IMPORTS (the import-boundary rule) — a file importing
 *     proposeEmbedded/castVoteEmbedded/service senders contains ZERO signing
 *     tokens yet signs and broadcasts internally; scanning import specifiers
 *     is what closes that bypass.
 *
 * The D1 integration test signs with an anvil throwaway key LEGALLY — it lives
 * in test/integration/, OUTSIDE the scanned dirs.
 */

const ROOT = join(__dirname, "..");
const SCANNED_DIRS = ["lib/admin", "app/admin", "app/api/admin", "components/admin"];

const FORBIDDEN_TOKENS = [
  "withEvmSigner",
  "sendRawTransaction",
  "sendTransaction",
  "signTransaction",
  "eth_sendTransaction",
  "writeContract",
  "signTypedData",
  "signMessage",
  "personal_sign",
  "eth_sign",
  "createWalletClient",
  "privateKeyToAccount",
  "mnemonicToAccount",
  "hdKeyToAccount",
  "TxButton",
] as const;

// Import specifiers that wrap signing internally (any subpath of lib/wallet),
// the repo's write/mint wrappers, and wagmi — plus relative paths into lib/wallet.
const FORBIDDEN_IMPORT_RE =
  /^(@\/lib\/wallet(\/|$)|@\/lib\/governance\/write(\/|$)|@\/lib\/dividends\/write(\/|$)|@\/lib\/passport\/mint(\/|$)|wagmi(\/|$))|(^|\/)lib\/wallet(\/|$)/;

export function forbiddenTokensIn(src: string): string[] {
  const lower = src.toLowerCase();
  return FORBIDDEN_TOKENS.filter((t) => lower.includes(t.toLowerCase()));
}

/** Every import/export-from/dynamic-import/require specifier in the source. */
export function importSpecifiersOf(src: string): string[] {
  const out: string[] = [];
  const patterns = [
    /(?:import|export)\s[^"']*?from\s+["']([^"']+)["']/g, // import x from / export x from
    /import\s+["']([^"']+)["']/g, // bare side-effect import
    /import\(\s*["']([^"']+)["']\s*\)/g, // dynamic import()
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) out.push(m[1]);
  }
  return out;
}

export function forbiddenImportsIn(src: string): string[] {
  return importSpecifiersOf(src).filter((s) => FORBIDDEN_IMPORT_RE.test(s));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

function adminSurfaceFiles(): string[] {
  return SCANNED_DIRS.flatMap((d) => {
    const full = join(ROOT, d);
    return existsSync(full) ? walk(full) : [];
  });
}

describe("rule fixtures (RED-proof: both rules FIRE on known-bad snippets)", () => {
  it("token rule fires on viem's bare signing flow and wagmi hooks (case-insensitive)", () => {
    expect(
      forbiddenTokensIn("const hash = await walletClient.sendTransaction({ to, data });"),
    ).toContain("sendTransaction");
    expect(forbiddenTokensIn("const { writeContractAsync } = useWriteContract();")).toContain(
      "writeContract",
    );
    expect(
      forbiddenTokensIn("const account = privateKeyToAccount(key); createWalletClient({});"),
    ).toEqual(expect.arrayContaining(["createWalletClient", "privateKeyToAccount"]));
    expect(forbiddenTokensIn('<TxButton label="SEND" />')).toContain("TxButton");
    expect(forbiddenTokensIn('rpc("ETH_SENDTRANSACTION")')).toContain("eth_sendTransaction");
  });

  it("import-boundary rule fires on wrappers that sign internally (zero tokens in the importer)", () => {
    expect(forbiddenImportsIn('import { proposeEmbedded } from "@/lib/governance/write";')).toEqual(
      ["@/lib/governance/write"],
    );
    expect(forbiddenImportsIn('import { sendEvm } from "@/lib/wallet/services/evmSend";')).toEqual([
      "@/lib/wallet/services/evmSend",
    ]);
    expect(forbiddenImportsIn('import { claimEmbedded } from "@/lib/dividends/write";')).toEqual([
      "@/lib/dividends/write",
    ]);
    expect(forbiddenImportsIn('import { submitMintExternal } from "@/lib/passport/mint";')).toEqual(
      ["@/lib/passport/mint"],
    );
    expect(forbiddenImportsIn('import { useAccount } from "wagmi";')).toEqual(["wagmi"]);
    expect(forbiddenImportsIn('import { x } from "../../lib/wallet/embedded/session";')).toEqual([
      "../../lib/wallet/embedded/session",
    ]);
  });

  it("rules stay quiet on legal admin code", () => {
    const legal = `
      import { encodeFunctionData, keccak256, stringToHex } from "viem";
      import { adminTreasuryAbi } from "@/lib/admin/abis";
      const data = encodeFunctionData({ abi: adminTreasuryAbi, functionName: "disburse", args });
      const reads = await client.readContract({ address, abi, functionName: "hasRole" });
    `;
    expect(forbiddenTokensIn(legal)).toEqual([]);
    expect(forbiddenImportsIn(legal)).toEqual([]);
  });
});

describe("admin surface enforcement (lib/admin, app/admin, app/api/admin, components/admin)", () => {
  it("scans a non-empty admin surface", () => {
    expect(adminSurfaceFiles().length).toBeGreaterThan(0);
  });

  it("NO forbidden signing token appears anywhere in the admin surface", () => {
    const offenders: string[] = [];
    for (const file of adminSurfaceFiles()) {
      const hits = forbiddenTokensIn(readFileSync(file, "utf8"));
      if (hits.length) offenders.push(`${file.replace(ROOT + "/", "")}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("NO forbidden import (signing wrapper / wagmi / lib/wallet) appears anywhere in the admin surface", () => {
    const offenders: string[] = [];
    for (const file of adminSurfaceFiles()) {
      const hits = forbiddenImportsIn(readFileSync(file, "utf8"));
      if (hits.length) offenders.push(`${file.replace(ROOT + "/", "")}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
