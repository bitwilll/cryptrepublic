#!/usr/bin/env node
/**
 * LOCAL ANVIL ONLY — never run against a real broadcast. Addresses for real nets
 * (Base Sepolia / mainnet) are a USER step (see contracts/docs/DEPLOY_RUNBOOK.md).
 *
 * Parses a Foundry broadcast (`contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json`)
 * for the CREATE transactions of `CryptRepublicPassport` and `CryptToken`, then
 * rewrites the `CONTRACTS[<chainId>]` entry in `config/contracts.ts` IN PLACE
 * (preserving every other chain). Prints the discovered addresses.
 *
 * Usage: node scripts/emit-contract-addresses.mjs [--chain 31337]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const chainId = Number(argValue("--chain", "31337"));
const broadcastPath = join(
  repoRoot,
  "contracts",
  "broadcast",
  "Deploy.s.sol",
  String(chainId),
  "run-latest.json",
);

let broadcast;
try {
  broadcast = JSON.parse(readFileSync(broadcastPath, "utf8"));
} catch (e) {
  console.error(`Cannot read broadcast at ${broadcastPath}: ${e.message}`);
  process.exit(1);
}

/** Find the deployed address for a given contractName among CREATE txs. */
function findAddress(contractName) {
  const txs = broadcast.transactions ?? [];
  for (const tx of txs) {
    const isCreate = tx.transactionType === "CREATE" || tx.transactionType === "CREATE2";
    if (isCreate && tx.contractName === contractName && tx.contractAddress) {
      return tx.contractAddress;
    }
  }
  return undefined;
}

const passport = findAddress("CryptRepublicPassport");
const token = findAddress("CryptToken");
const staking = findAddress("CryptStaking");
const governance = findAddress("CryptGovernance");
const treasury = findAddress("CryptTreasury");
const distributor = findAddress("DividendDistributor");

if (!passport) {
  console.error("No CryptRepublicPassport CREATE tx found in broadcast.");
  process.exit(1);
}

// Rewrite the single keyed line in config/contracts.ts, preserving other chains.
const contractsPath = join(repoRoot, "config", "contracts.ts");
let src = readFileSync(contractsPath, "utf8");

const entryFields = [`passport: "${passport}"`];
if (token) entryFields.push(`token: "${token}"`);
if (staking) entryFields.push(`staking: "${staking}"`);
if (governance) entryFields.push(`governance: "${governance}"`);
if (treasury) entryFields.push(`treasury: "${treasury}"`);
if (distributor) entryFields.push(`distributor: "${distributor}"`);
const entryLiteral = `{ ${entryFields.join(", ")} }`;

// Match `  31337: {...},` (single-line) — the seeded placeholder or a prior emit.
const keyRe = new RegExp(`(\\n\\s*${chainId}:\\s*)\\{[^}]*\\}(,)`);
if (keyRe.test(src)) {
  src = src.replace(keyRe, `$1${entryLiteral}$2`);
} else {
  console.error(`Could not find a single-line CONTRACTS[${chainId}] entry to replace.`);
  process.exit(1);
}

writeFileSync(contractsPath, src, "utf8");
console.log(`Emitted CONTRACTS[${chainId}] = ${entryLiteral}`);
console.log(`  passport:    ${passport}`);
if (token) console.log(`  token:       ${token}`);
if (staking) console.log(`  staking:     ${staking}`);
if (governance) console.log(`  governance:  ${governance}`);
if (treasury) console.log(`  treasury:    ${treasury}`);
if (distributor) console.log(`  distributor: ${distributor}`);
