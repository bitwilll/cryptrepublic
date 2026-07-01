import { PrismaClient } from "@prisma/client";

/**
 * Wave 7 seed — migrates the static mockup arrays into off-chain-content models.
 *
 * HONESTY (constraint #5 / §7.13):
 * - The seeded ASSET register asserts on-chain provenance that does NOT exist on
 *   the real chain, so provenance strings are scrubbed here: any
 *   `CR-L2` / `CryptRepublic L2` / `TITLED ON CHAIN` / `16% NETWORK` token in
 *   name/location/status is dropped or genericized (marked "(demonstrative)").
 *   The Holdings screen (B4) additionally renders the AUM total behind a visible
 *   SEEDED/DEMONSTRATIVE tag — the seeded total is never a live valuation.
 * - Per-city population is NOT seeded as live: `CityCensus.seededCount` is a
 *   labeled SEEDED SNAPSHOT (demonstrative geography only). The live per-city
 *   count comes from aggregating `CitizenshipApplication.domicileCity` over
 *   MINTED citizens (citizenTokenId != null), and the trustless total is always
 *   `CryptRepublicPassport.totalCitizens()` — never these seeds.
 * - Governance proposal content + comments are NOT seeded (they attach to real
 *   on-chain proposalIds; a fresh chain has none).
 *
 * Idempotent: every write is an `upsert` keyed by the model's natural key, so
 * re-running leaves row counts unchanged.
 */

const prisma = new PrismaClient();

/** Scrub fabricated on-chain provenance from a seeded string. */
function scrub(s: string): string {
  return s
    .replace(/·?\s*TITLED ON CHAIN/gi, "")
    .replace(/·?\s*16% NETWORK/gi, "(demonstrative)")
    .replace(/CryptRepublic L2/gi, "validator pool")
    .replace(/CR-L2/gi, "off-chain")
    .replace(/\s{2,}/g, " ")
    .replace(/·\s*$/g, "")
    .trim();
}

interface RawAsset {
  ref: string;
  kind: string;
  name: string;
  loc: string;
  val: number;
  yld: number;
  ann: number;
  status: string;
  acq: string;
}

// From dash-holdings.jsx ASSETS (lines 13–38). val=whole USD, yld=percent.
const ASSETS: RawAsset[] = [
  // Real estate
  {
    ref: "RE-001",
    kind: "re",
    name: "Embassy Lisbon — Avenida da Liberdade",
    loc: "Lisbon, PT",
    val: 28400000,
    yld: 4.8,
    ann: 1363200,
    status: "OWNED · TITLED ON CHAIN",
    acq: "2024.11.04",
  },
  {
    ref: "RE-002",
    kind: "re",
    name: "Embassy Tokyo — Shimokitazawa block",
    loc: "Tokyo, JP",
    val: 41200000,
    yld: 3.6,
    ann: 1483200,
    status: "OWNED · TITLED ON CHAIN",
    acq: "2025.01.22",
  },
  {
    ref: "RE-003",
    kind: "re",
    name: "Embassy New York — East Village",
    loc: "New York, US",
    val: 38900000,
    yld: 4.1,
    ann: 1594900,
    status: "OWNED · TITLED ON CHAIN",
    acq: "2025.02.14",
  },
  {
    ref: "RE-004",
    kind: "re",
    name: "Embassy Tallinn — Telliskivi",
    loc: "Tallinn, EE",
    val: 9200000,
    yld: 5.4,
    ann: 496800,
    status: "OWNED · TITLED ON CHAIN",
    acq: "2024.09.18",
  },
  {
    ref: "RE-005",
    kind: "re",
    name: "Embassy Berlin — Mitte / Torstraße",
    loc: "Berlin, DE",
    val: 22800000,
    yld: 4.3,
    ann: 980400,
    status: "OWNED · TITLED ON CHAIN",
    acq: "2024.12.02",
  },
  {
    ref: "RE-006",
    kind: "re",
    name: "Citizens' Farmland — Alentejo (3 800 ha)",
    loc: "Alentejo, PT",
    val: 14600000,
    yld: 5.8,
    ann: 846800,
    status: "OWNED · TITLED ON CHAIN",
    acq: "2025.03.30",
  },
  {
    ref: "RE-007",
    kind: "re",
    name: "Solar Estate — Atacama (820 acres)",
    loc: "Atacama, CL",
    val: 18400000,
    yld: 7.2,
    ann: 1324800,
    status: "OWNED · TITLED ON CHAIN",
    acq: "2025.07.18",
  },
  // Patents & IP
  {
    ref: "IP-001",
    kind: "ip",
    name: "US 11,492,818 — Soulbound credential issuance",
    loc: "USPTO · 17 jurisdictions",
    val: 18600000,
    yld: 9.4,
    ann: 1748400,
    status: "GRANTED · LICENSED",
    acq: "2025.04.11",
  },
  {
    ref: "IP-002",
    kind: "ip",
    name: "EP 4 028 191 — Pseudonymous voting with proof",
    loc: "EPO · 26 jurisdictions",
    val: 14200000,
    yld: 8.1,
    ann: 1150200,
    status: "GRANTED · LICENSED",
    acq: "2025.06.04",
  },
  {
    ref: "IP-003",
    kind: "ip",
    name: "JP 7 102 488 — Embassy interop protocol",
    loc: "JPO",
    val: 6800000,
    yld: 6.6,
    ann: 448800,
    status: "GRANTED",
    acq: "2025.09.22",
  },
  {
    ref: "IP-004",
    kind: "ip",
    name: "PCT/CR2026/00041 — On-chain census",
    loc: "WIPO · pending",
    val: 11400000,
    yld: 0.0,
    ann: 0,
    status: "PENDING · 31m FILED",
    acq: "2026.02.04",
  },
  // Equity / chain — scrubbed of CR-L2 provenance
  {
    ref: "EQ-001",
    kind: "eq",
    name: "Validator Pool §14 — CryptRepublic L2",
    loc: "Chain · CR-L2",
    val: 92400000,
    yld: 11.8,
    ann: 10903200,
    status: "STAKED · 16% NETWORK",
    acq: "2024.10.01",
  },
  {
    ref: "EQ-002",
    kind: "eq",
    name: "Stake — Republic Bridge Inc.",
    loc: "Cayman · Class A",
    val: 36800000,
    yld: 7.4,
    ann: 2723200,
    status: "OWNED · 18% EQUITY",
    acq: "2025.05.12",
  },
  {
    ref: "EQ-003",
    kind: "eq",
    name: "Stake — Translation Council OpCo",
    loc: "Estonia · OÜ",
    val: 4200000,
    yld: 2.1,
    ann: 88200,
    status: "OWNED · 100% EQUITY",
    acq: "2025.08.04",
  },
  // Treasury reserves
  {
    ref: "TR-001",
    kind: "tr",
    name: "Stablecoin reserve (USDC, EURC, USDT)",
    loc: "Multisig 4-of-7",
    val: 68400000,
    yld: 4.6,
    ann: 3146400,
    status: "LIQUID",
    acq: "ongoing",
  },
  {
    ref: "TR-002",
    kind: "tr",
    name: "Bitcoin reserve",
    loc: "Cold · 0xbtc…",
    val: 16200000,
    yld: 0.0,
    ann: 0,
    status: "LIQUID · NON-YIELDING",
    acq: "ongoing",
  },
  {
    ref: "TR-003",
    kind: "tr",
    name: "Ethereum reserve (incl. staked ETH)",
    loc: "Cold · 0xeth…",
    val: 14800000,
    yld: 3.2,
    ann: 473600,
    status: "STAKED 64%",
    acq: "ongoing",
  },
];

interface RawEmbassy {
  code: string;
  name: string;
  ne: string;
  hr: string;
  founded: string;
  flag: string;
  country: string;
}

// From dash-population-embassies.jsx EMB (lines 230–240).
const EMBASSIES: RawEmbassy[] = [
  {
    code: "LIS",
    name: "Lisbon",
    ne: "Avenida da Liberdade · Príncipe Real",
    hr: "Mon–Sun · 09–22 WET",
    founded: "2024.11.04",
    flag: "#7cffa6",
    country: "Portugal",
  },
  {
    code: "TLL",
    name: "Tallinn",
    ne: "Telliskivi Loomelinnak · Kalamaja",
    hr: "Mon–Sun · 09–21 EET",
    founded: "2024.09.18",
    flag: "#a8c0e4",
    country: "Estonia",
  },
  {
    code: "TYO",
    name: "Tokyo",
    ne: "Shimokitazawa · Setagaya",
    hr: "Mon–Sun · 10–23 JST",
    founded: "2025.01.22",
    flag: "#ffd4a8",
    country: "Japan",
  },
  {
    code: "NYC",
    name: "New York",
    ne: "East Village · Manhattan",
    hr: "Mon–Sat · 10–24 EST",
    founded: "2025.02.14",
    flag: "#ff9d9d",
    country: "United States",
  },
  {
    code: "BUE",
    name: "Buenos Aires",
    ne: "Palermo · Soho",
    hr: "Mon–Sun · 11–24 ART",
    founded: "2026.04.21",
    flag: "#c8a96a",
    country: "Argentina",
  },
  {
    code: "LAG",
    name: "Lagos",
    ne: "Yaba · Mainland",
    hr: "Tue–Sun · 10–22 WAT",
    founded: "2025.08.30",
    flag: "#7cffa6",
    country: "Nigeria",
  },
  {
    code: "SIN",
    name: "Singapore",
    ne: "Tiong Bahru",
    hr: "Mon–Sun · 09–22 SGT",
    founded: "2025.05.04",
    flag: "#a8c0e4",
    country: "Singapore",
  },
  {
    code: "DXB",
    name: "Dubai",
    ne: "Alserkal Avenue · Al Quoz",
    hr: "Sat–Thu · 10–23 GST",
    founded: "2025.11.11",
    flag: "#ffd4a8",
    country: "United Arab Emirates",
  },
  {
    code: "BER",
    name: "Berlin",
    ne: "Mitte · Torstraße",
    hr: "Mon–Sun · 09–24 CET",
    founded: "2024.12.02",
    flag: "#c8a96a",
    country: "Germany",
  },
];

interface RawCity {
  code: string;
  name: string;
  lat: number;
  long: number;
  pop: number;
}

// From dash-population-embassies.jsx CITIES (lines 9–22). Real approximate
// lat/long (the mockup's x/y are pixel coords; the map is a Mercator-ish
// projection driven by real coordinates). `pop` → seededCount (demonstrative).
const CITIES: RawCity[] = [
  { code: "LIS", name: "Lisbon", lat: 38.72, long: -9.14, pop: 4108 },
  { code: "TLL", name: "Tallinn", lat: 59.44, long: 24.75, pop: 3814 },
  { code: "TYO", name: "Tokyo", lat: 35.68, long: 139.69, pop: 6210 },
  { code: "NYC", name: "New York", lat: 40.71, long: -74.01, pop: 5402 },
  { code: "BUE", name: "Buenos Aires", lat: -34.6, long: -58.38, pop: 2890 },
  { code: "LAG", name: "Lagos", lat: 6.52, long: 3.38, pop: 1894 },
  { code: "SIN", name: "Singapore", lat: 1.35, long: 103.82, pop: 2402 },
  { code: "BLR", name: "Bengaluru", lat: 12.97, long: 77.59, pop: 2102 },
  { code: "BER", name: "Berlin", lat: 52.52, long: 13.4, pop: 3210 },
  { code: "MEX", name: "Mexico City", lat: 19.43, long: -99.13, pop: 1604 },
  { code: "AKL", name: "Auckland", lat: -36.85, long: 174.76, pop: 802 },
  { code: "DXB", name: "Dubai", lat: 25.2, long: 55.27, pop: 1410 },
];

// From dash-gov-treasury.jsx ALLOC (lines 177–183). pct → targetBps (pct*100).
const ALLOCATIONS = [
  { bucket: "embassy_ops", label: "Embassy operations", pct: 38, color: "#c8a96a" },
  { bucket: "validator_rewards", label: "Validator rewards", pct: 22, color: "#1f8a5b" },
  { bucket: "citizen_grants", label: "Citizen grants", pct: 17, color: "#7cffa6" },
  { bucket: "translation_council", label: "Translation Council", pct: 9, color: "#a8c0e4" },
  { bucket: "general_reserve", label: "General Reserve", pct: 14, color: "#5a6a7d" },
];

const CONSTITUTION = [
  {
    key: "preamble",
    title: "Preamble",
    body: "We the citizens, having no shared soil, no shared blood, no shared past — but a shared chain — do hereby ratify, before time and before each other, this Republic.",
    citation: "CONSTITUTION · ARTICLE I · PREAMBLE",
  },
  {
    key: "doctrine_art_iv",
    title: "The doctrine",
    body: "Every parcel of land. Every patent granted. Every equity stake taken. Every coin reserved. All of it is owned, in equal share, by every citizen of the Republic. The dividends are paid pro-rata, every quarter, on chain, without exception.",
    citation: "CONSTITUTION ART. IV §1 · RATIFIED MMXXVI",
  },
  {
    key: "dividend_legal_note",
    title: "On dividends",
    body: "Dividends distributed to citizens are likely a regulated security in many jurisdictions. Nothing here is an offer or solicitation. Participation may carry legal and tax obligations — consult the disclosures and your own counsel before claiming.",
    citation: null,
  },
];

const EMBASSY_CODES = new Set(EMBASSIES.map((e) => e.code));

export async function seed(): Promise<void> {
  for (const a of ASSETS) {
    const data = {
      kind: a.kind,
      name: scrub(a.name),
      location: scrub(a.loc),
      valueUsd: BigInt(a.val),
      yieldBps: Math.round(a.yld * 100),
      annualYieldUsd: BigInt(a.ann),
      status: scrub(a.status) || "OWNED (demonstrative)",
      acquiredAt: a.acq,
    };
    await prisma.assetCatalogEntry.upsert({
      where: { ref: a.ref },
      update: data,
      create: { ref: a.ref, ...data },
    });
  }

  for (const e of EMBASSIES) {
    const data = {
      name: e.name,
      neighborhood: e.ne,
      hours: e.hr,
      foundedAt: e.founded,
      brandColor: e.flag,
      city: e.name,
      country: e.country,
    };
    await prisma.embassyDirectory.upsert({
      where: { code: e.code },
      update: data,
      create: { code: e.code, ...data },
    });
  }

  for (const c of CITIES) {
    const data = {
      name: c.name,
      lat: c.lat,
      long: c.long,
      hasEmbassy: EMBASSY_CODES.has(c.code),
      seededCount: c.pop,
    };
    await prisma.cityCensus.upsert({
      where: { code: c.code },
      update: data,
      create: { code: c.code, ...data },
    });
  }

  for (const al of ALLOCATIONS) {
    const data = { label: al.label, targetBps: al.pct * 100, color: al.color };
    await prisma.treasuryAllocation.upsert({
      where: { bucket: al.bucket },
      update: data,
      create: { bucket: al.bucket, ...data },
    });
  }

  for (const c of CONSTITUTION) {
    const data = { title: c.title, body: c.body, citation: c.citation };
    await prisma.constitutionText.upsert({
      where: { key: c.key },
      update: data,
      create: { key: c.key, ...data },
    });
  }
}

// Run as a script (pnpm db:seed / prisma seed hook). The test imports `seed`
// directly and manages its own client lifecycle.
const isMain = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isMain) {
  seed()
    .then(async () => {
      await prisma.$disconnect();
      // eslint-disable-next-line no-console
      console.log("Seed complete.");
    })
    .catch(async (err) => {
      await prisma.$disconnect();
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
