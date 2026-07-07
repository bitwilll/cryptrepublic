/**
 * THE STATE REGISTRY — the cryptrepublic.com service and utility catalogue,
 * transcribed from the .COM tree of the Cabinet's CRYPTREPUBLIC Miro board
 * (July 2026). Per the Cabinet's direction, the board's .IO and .ORG branches
 * are SEPARATE future properties and are deliberately NOT part of this site.
 * This file is the single source of truth for the public /services directory.
 *
 * Every .COM board item appears here. `status` records where each item stands:
 *  - "live"            — operational today; `href` points at the feature
 *  - "beta"            — operational with reduced scope
 *  - "in-development"  — being built now
 *  - "planned"         — ratified intent, not yet in development
 */

export type RegistryStatus = "live" | "beta" | "in-development" | "planned";

export type RegistryBranch = "services" | "utilities";

export interface RegistryCapability {
  title: string;
  summary?: string;
}

export interface RegistryItem {
  /** stable kebab-case id (referenced by knowledge articles + interest rows) */
  id: string;
  title: string;
  branch: RegistryBranch;
  /** one-line card summary */
  summary: string;
  /** longer dossier paragraph (board note text where the board had one) */
  detail?: string;
  status: RegistryStatus;
  /** destination when the feature is usable today */
  href?: string;
  external?: boolean;
  /** sub-capabilities listed on the board under this node */
  capabilities?: readonly RegistryCapability[];
}

export const REGISTRY_BRANCH_LABELS: Record<RegistryBranch, { title: string; blurb: string }> = {
  services: {
    title: "Citizen services",
    blurb: "The everyday services of citizenship — identity, wallet, attestation, and dividends.",
  },
  utilities: {
    title: "Citizen utilities",
    blurb: "Sovereign utilities built on the passport — trust, commerce, estate, and cover.",
  },
};

export const REGISTRY: readonly RegistryItem[] = [
  // ─── .COM — user services ──────────────────────────────────────────────
  {
    id: "user-signup",
    title: "Citizen signup",
    branch: "services",
    summary: "Register, apply for citizenship, and take the oath.",
    status: "live",
    href: "/auth",
  },
  {
    id: "user-reports",
    title: "Citizen reports",
    branch: "services",
    summary: "Personal activity reports — your standing, votes, and holdings in one statement.",
    status: "in-development",
  },
  {
    id: "biometrics",
    title: "Biometrics",
    branch: "services",
    summary: "Passkey sign-in with your device's biometric authenticator.",
    status: "live",
    href: "/dashboard/wallet/security",
  },
  {
    id: "wallet",
    title: "Sovereign wallet",
    branch: "services",
    summary: "The non-custodial citizen wallet — your keys never leave your device.",
    status: "live",
    href: "/dashboard/wallet",
    capabilities: [
      { title: "Sign transactions" },
      { title: "Sign logins & smart contracts" },
      { title: "Send / receive crypto" },
      { title: "Passport NFT" },
      { title: "Send signed messages" },
    ],
  },
  {
    id: "user-profiling",
    title: "Citizen profiling / score",
    branch: "services",
    summary: "Your civic profile and trust score, earned through participation.",
    status: "live",
    href: "/dashboard/trust",
  },
  {
    id: "user-dashboard",
    title: "Citizen dashboard",
    branch: "services",
    summary: "The seat of your citizenship — every service in one place.",
    status: "live",
    href: "/dashboard",
  },
  {
    id: "witness-attestation",
    title: "Witness attestation",
    branch: "services",
    summary: "Citizens witness citizens: seven attestations seal a passport.",
    status: "live",
    href: "/dashboard/witness",
  },
  {
    id: "oath-anthem",
    title: "Oath & anthem formalities",
    branch: "services",
    summary: "The ceremonial texts of citizenship — oath, anthem, and prayer.",
    status: "live",
    href: "/documents/oath",
  },
  {
    id: "user-awards",
    title: "Citizen awards",
    branch: "services",
    summary: "State commendations for service to the Republic.",
    status: "in-development",
  },
  {
    id: "user-staking",
    title: "Citizen staking",
    branch: "services",
    summary: "Stake with the Republic's validators. Financial rails arrive after audit.",
    status: "planned",
  },
  {
    id: "dividends",
    title: "Dividends",
    branch: "services",
    summary: "Citizen dividends from sovereign holdings, claimable on-chain.",
    status: "live",
    href: "/dashboard/holdings",
  },

  // ─── .COM — user utilities ─────────────────────────────────────────────
  {
    id: "one-portal",
    title: "One-Portal authentication",
    branch: "utilities",
    summary: "Sign in to many portals with one passport — token, TOTP, or wallet QR.",
    detail:
      "Use your passport as blockchain KYC and login identity across portals: one-time auth tokens, time-based two-factor, and wallet QR scanning. One Portal also covers signup, login, and KYC verification; a system-assigned citizen email is encrypted so only the holder of the passport and its seed can decrypt it.",
    status: "beta",
    href: "/auth",
  },
  {
    id: "crypt-email",
    title: "Crypt-Email",
    branch: "utilities",
    summary: "An encrypted state mail service for secure communication and sign-in.",
    status: "planned",
  },
  {
    id: "cryptlancer",
    title: "CryptLancer",
    branch: "utilities",
    summary: "A LinkedIn-type professional profile bound to your passport.",
    status: "planned",
  },
  {
    id: "referrals",
    title: "Referrals",
    branch: "utilities",
    summary: "Refer new citizens and vouch for their passports.",
    detail:
      "Citizens can refer other citizens for joining CryptRepublic, refer products and services to their referrals for gainful purposes, and create unique referral links for referral income.",
    status: "live",
    href: "/dashboard/referrals",
  },
  {
    id: "no-kyc",
    title: "NO-KYC",
    branch: "utilities",
    summary: "Zero-knowledge KYC: prove you are trusted without disclosing who you are.",
    detail:
      "With the passport's One Portal, a citizen can opt for NO-KYC at services that accept zero-trust / zero-knowledge KYC by CryptRepublic. Every passport carries a unique fingerprint and seven trusted attestations — that is the zero-knowledge trust.",
    status: "beta",
  },
  {
    id: "finance-manager",
    title: "Finance / asset manager & split",
    branch: "utilities",
    summary: "A personal finance, asset-management, and bill-split app for every citizen.",
    status: "planned",
  },
  {
    id: "privacy-apps",
    title: "Covert & privacy apps",
    branch: "utilities",
    summary: "Privacy-preserving tools issued to every citizen.",
    status: "planned",
  },
  {
    id: "knowledgebase",
    title: "Knowledgebase",
    branch: "utilities",
    summary: "The State Encyclopedia — how every organ of the Republic works.",
    status: "live",
    href: "/knowledge",
  },
  {
    id: "certificates",
    title: "Signing message & certificate",
    branch: "utilities",
    summary: "Sign messages and documents with your wallet; anyone can verify the seal.",
    detail:
      "Citizens sign messages and documents to attest and certify statements. Certificates carry a public serial and can be verified by anyone, without an account.",
    status: "live",
    href: "/dashboard/certificates",
  },
  {
    id: "passport-utility",
    title: "Passport",
    branch: "utilities",
    summary: "One document: unique ID, internet-of-trust, visa, and warranty registry.",
    status: "live",
    href: "/dashboard/passport",
    capabilities: [
      { title: "Unique ID", summary: "Your soulbound identity on-chain." },
      { title: "Internet of trust", summary: "Standing through the civic score." },
      { title: "Visa", summary: "Attend places and conferences — invite only." },
      {
        title: "Warranty registry",
        summary: "Attach product serial numbers for warranty and anti-theft recovery.",
      },
    ],
  },
  {
    id: "trust-score",
    title: "Trust score",
    branch: "utilities",
    summary: "Participation raises it; verified disputes lower it. Trust unlocks the Republic.",
    detail:
      "Activities, trades, reviews, votes, and actions move the trust score. With standing, a citizen gains eligibility to refer others, unlock exclusive trades and tenders, gain visa capabilities, run for election, and upgrade status. Upon a verified dispute or convicted felony the score may go negative.",
    status: "live",
    href: "/dashboard/trust",
  },
  {
    id: "bitwill",
    title: "BitWill — inheritance",
    branch: "utilities",
    summary: "A wallet-signed inheritance directive for your estate record.",
    status: "live",
    href: "/dashboard/bitwill",
  },
  {
    id: "store",
    title: "Citizen store",
    branch: "utilities",
    summary: "Buy and sell citizen-to-citizen; settlement stays peer-to-peer.",
    status: "live",
    href: "/dashboard/store",
    capabilities: [{ title: "Citizen as buyer" }, { title: "Citizen as seller" }],
  },
  {
    id: "insurance",
    title: "Citizen insurance",
    branch: "utilities",
    summary: "Apply for asset and health cover under the Republic's registry.",
    status: "live",
    href: "/dashboard/insurance",
    capabilities: [{ title: "Asset insurance" }, { title: "Health insurance" }],
  },
];

/** items grouped by branch, preserving board order */
export function registryByBranch(): Record<RegistryBranch, RegistryItem[]> {
  const groups: Record<RegistryBranch, RegistryItem[]> = {
    services: [],
    utilities: [],
  };
  for (const item of REGISTRY) groups[item.branch].push(item);
  return groups;
}

export function registryItem(id: string): RegistryItem | undefined {
  return REGISTRY.find((i) => i.id === id);
}

export const REGISTRY_STATUS_LABELS: Record<RegistryStatus, string> = {
  live: "In service",
  beta: "Beta",
  "in-development": "In development",
  planned: "Planned",
};
