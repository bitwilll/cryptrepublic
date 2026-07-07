/**
 * THE STATE COMMISSARY (Wave 15) — the merchandise catalogue from the Cabinet's
 * board, every item included. Items are CONTENT, not database rows: the
 * register-of-interest API (app/api/commissary/interest) validates itemIds
 * against this list, and CommissaryInterest rows reference these ids.
 *
 * No prices and no checkout — the commissary is a register of interest while
 * provisioning is arranged; the Republic moves no funds.
 */

export const COMMISSARY_CATEGORIES = [
  "Insignia",
  "Apparel",
  "Homeware",
  "Personal",
  "Provisions",
  "Instruments",
] as const;

export type CommissaryCategory = (typeof COMMISSARY_CATEGORIES)[number];

export interface CommissaryItem {
  /** stable kebab-case id (referenced by CommissaryInterest rows) */
  id: string;
  title: string;
  category: CommissaryCategory;
  /** issue note — one line of registry voice */
  note: string;
}

export const COMMISSARY: readonly CommissaryItem[] = [
  // ─── INSIGNIA ────────────────────────────────────────────────────────────
  {
    id: "enamel-pins",
    title: "Enamel pins — glow in dark",
    category: "Insignia",
    note: "The crest in hard enamel; the border phosphoresces after dusk.",
  },
  {
    id: "passport-booklet",
    title: "Passport booklet",
    category: "Insignia",
    note: "A physical companion to the soulbound record — navy board, gold blocking.",
  },
  {
    id: "smart-card",
    title: "Smart card",
    category: "Insignia",
    note: "Wallet-format citizen card with your public address engraved. No keys aboard.",
  },
  {
    id: "badges",
    title: "Badges",
    category: "Insignia",
    note: "Office and embassy badges, issued by rank and returned at term's end.",
  },

  // ─── APPAREL ─────────────────────────────────────────────────────────────
  {
    id: "tshirts-shirts",
    title: "T-shirts & shirts",
    category: "Apparel",
    note: "Heavyweight cotton, crest at the breast, registry mono at the hem.",
  },
  {
    id: "socks",
    title: "Socks",
    category: "Apparel",
    note: "Navy with a gold seal at the calf. Standard issue morale equipment.",
  },
  {
    id: "handkerchief-towel",
    title: "Handkerchief & towel",
    category: "Apparel",
    note: "Woven crest jacquard; hemmed in line grey.",
  },
  {
    id: "cufflinks",
    title: "Cufflinks",
    category: "Apparel",
    note: "The seal in brushed metal, for oath ceremonies and state occasions.",
  },

  // ─── HOMEWARE ────────────────────────────────────────────────────────────
  {
    id: "cup-mug",
    title: "Cup & mug",
    category: "Homeware",
    note: "Stoneware in paper white, crest fired under the glaze.",
  },
  {
    id: "cutlery-set",
    title: "Cutlery — plates, knife, spoon, fork, soup spoon",
    category: "Homeware",
    note: "The full state table service, stamped with the seal.",
  },
  {
    id: "card-holder",
    title: "Card holder",
    category: "Homeware",
    note: "For the smart card and its civilian companions. Leather, navy stitch.",
  },
  {
    id: "water-bottle-flask",
    title: "Water bottle & flask",
    category: "Homeware",
    note: "Insulated steel; the refrain of the anthem etched around the base.",
  },
  {
    id: "fridge-magnet",
    title: "Fridge magnet",
    category: "Homeware",
    note: "The crest at kitchen scale. Embassy skyline series to follow.",
  },

  // ─── PERSONAL ────────────────────────────────────────────────────────────
  {
    id: "tongue-cleaner",
    title: "Tongue cleaner",
    category: "Personal",
    note: "Surgical steel. The Republic attends to details.",
  },
  {
    id: "toothbrush-metal",
    title: "Toothbrush — metal",
    category: "Personal",
    note: "Machined handle, replaceable head; built to outlast administrations.",
  },
  {
    id: "metal-comb",
    title: "Metal comb",
    category: "Personal",
    note: "Anodised aluminium, crest at the spine.",
  },
  {
    id: "fragrance",
    title: "Fragrance",
    category: "Personal",
    note: "The state scent: cedar, ink, and cold air. Ratified by committee.",
  },
  {
    id: "rings",
    title: "Rings",
    category: "Personal",
    note: "The seal as signet — the traditional instrument of the signature.",
  },
  {
    id: "keychain",
    title: "Keychain",
    category: "Personal",
    note: "For the keys the Republic does NOT hold.",
  },

  // ─── PROVISIONS ──────────────────────────────────────────────────────────
  {
    id: "chocolates-cookies",
    title: "Chocolates & cookies",
    category: "Provisions",
    note: "Dark chocolate seals; shortbread stamped with the crest.",
  },
  {
    id: "tea-coffee",
    title: "Tea & coffee",
    category: "Provisions",
    note: "The embassy blend — served at every oath signing.",
  },
  {
    id: "water",
    title: "Water",
    category: "Provisions",
    note: "Still and sparkling, bottled under the state label.",
  },
  {
    id: "soft-drinks",
    title: "Soft drinks",
    category: "Provisions",
    note: "The commissary line of citrus and cola, sugar-honest labelling.",
  },
  {
    id: "chewing-gum",
    title: "Chewing gum",
    category: "Provisions",
    note: "Mint. Issued in ration-book packaging.",
  },
  {
    id: "mints",
    title: "Mints",
    category: "Provisions",
    note: "Pressed with the seal; the tin outlives the mints.",
  },
  {
    id: "psyllium-husk",
    title: "Psyllium husk [isabgul]",
    category: "Provisions",
    note: "Fibre for the body politic. Plain, effective, unglamorous.",
  },
  {
    id: "vit-c-tabs",
    title: "Vitamin C tablets",
    category: "Provisions",
    note: "Effervescent, orange, state-issue immunity doctrine.",
  },
  {
    id: "electrolyte-powder",
    title: "Electrolyte powder",
    category: "Provisions",
    note: "For long assemblies and longer block times.",
  },
  {
    id: "soda",
    title: "Soda",
    category: "Provisions",
    note: "Club soda under the commissary label.",
  },
  {
    id: "kombucha",
    title: "Kombucha",
    category: "Provisions",
    note: "Fermented under supervision. The culture is also decentralised.",
  },

  // ─── INSTRUMENTS ─────────────────────────────────────────────────────────
  {
    id: "pendrives",
    title: "Pendrives",
    category: "Instruments",
    note: "State-crested storage. Ships empty — your data, like your keys, is yours.",
  },
  {
    id: "crypto-node",
    title: "CryptRepublic crypto node",
    category: "Instruments",
    note: "A citizen-run node kit: verify the Republic yourself, from your own shelf.",
  },
  {
    id: "coins-enamel",
    title: "Coins with enamel",
    category: "Instruments",
    note: "Commemorative strikes for ratifications and embassy openings. Not legal tender; the ledger is.",
  },
  {
    id: "state-stamp",
    title: "State stamp",
    category: "Instruments",
    note: "The circular seal as a desk instrument, per the stationery specimen.",
  },
];

const idSet = new Set(COMMISSARY.map((i) => i.id));

export function isCommissaryItemId(id: string): boolean {
  return idSet.has(id);
}

export function commissaryItem(id: string): CommissaryItem | undefined {
  return COMMISSARY.find((i) => i.id === id);
}

/** items grouped by category, preserving board order */
export function commissaryByCategory(): Record<CommissaryCategory, CommissaryItem[]> {
  const groups = {} as Record<CommissaryCategory, CommissaryItem[]>;
  for (const c of COMMISSARY_CATEGORIES) groups[c] = [];
  for (const item of COMMISSARY) groups[item.category].push(item);
  return groups;
}
