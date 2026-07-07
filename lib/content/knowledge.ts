/**
 * THE STATE ENCYCLOPEDIA (Wave 15) — /knowledge. Fourteen articles describing
 * how the organs of the Republic actually work, written against the code:
 * lib/trust/score.ts, lib/referrals/gate.ts, lib/passport/*, lib/auth/*,
 * lib/dividends/*, lib/treasury/*, lib/wallet/mode.ts, prisma/schema.prisma.
 *
 * `related` values are lib/content/registry.ts ids (integrity-tested).
 * Section bodies are plain text; "\n\n" separates paragraphs.
 */

export type KnowledgeTheme =
  | "Identity & entry"
  | "Trust & standing"
  | "Economy & treasury"
  | "Wallet & instruments";

export interface KnowledgeSection {
  heading: string;
  body: string;
}

export interface KnowledgeArticle {
  slug: string;
  title: string;
  /** one-paragraph standfirst under the title */
  standfirst: string;
  theme: KnowledgeTheme;
  sections: readonly KnowledgeSection[];
  /** registry ids (lib/content/registry.ts) this article relates to */
  related: readonly string[];
}

export const KNOWLEDGE_THEMES: readonly KnowledgeTheme[] = [
  "Identity & entry",
  "Trust & standing",
  "Economy & treasury",
  "Wallet & instruments",
];

export const KNOWLEDGE: readonly KnowledgeArticle[] = [
  // ─── IDENTITY & ENTRY ────────────────────────────────────────────────────
  {
    slug: "one-portal-authentication",
    title: "One-Portal authentication",
    standfirst:
      "One identity, several doors: passphrase, passkey, or a QR code your wallet signs. The Republic verifies you without ever holding anything that could impersonate you.",
    theme: "Identity & entry",
    related: ["one-portal", "biometrics", "user-signup"],
    sections: [
      {
        heading: "The base credential",
        body: "Every account begins with an email address and a passphrase. The passphrase is never stored: the server keeps only an Argon2 hash, which can confirm a passphrase but cannot reproduce it. A successful sign-in issues a session cookie — HttpOnly and same-site, so scripts cannot read it and foreign sites cannot ride it. Sign-in attempts are rate-limited and locked out on abuse.",
      },
      {
        heading: "Wallet-QR sign-in",
        body: "A citizen at a desktop can sign in without typing anything. The screen shows a QR code carrying a public envelope — a challenge identifier, a one-time nonce, a short match code, and the site's domain. The citizen scans it with the wallet on their phone, checks that the match code on both screens agrees, and the wallet signs the challenge. The server recovers the signing address from the signature, matches it to the citizen, and opens the session. The envelope contains no secret at all; an intercepted QR is just a puzzle with no prize.\n\nChallenges are short-lived and consumed exactly once — a replayed signature meets a spent challenge and fails.",
      },
      {
        heading: "Passkeys",
        body: "For a second factor, or a passwordless first one, the Republic issues passkeys (WebAuthn). Your device's authenticator — fingerprint reader, face unlock, or hardware key — generates a key pair; the server stores only the public half and a signature counter. Phishing sites fail structurally: a passkey is bound to the Republic's domain and will not answer to an imitation. This is why the Republic chose passkeys over authenticator-app codes, which can be phished in real time.",
      },
    ],
  },
  {
    slug: "no-kyc",
    title: "NO-KYC: zero-knowledge trust",
    standfirst:
      "Prove that you are trusted without disclosing who you are. The passport replaces document checks with something stronger: seven citizens who staked their standing on you.",
    theme: "Identity & entry",
    related: ["no-kyc", "one-portal", "passport-utility"],
    sections: [
      {
        heading: "The problem with KYC",
        body: "Conventional know-your-customer checks collect a passport scan, a selfie, and a utility bill, then store them in a database that will eventually leak. The check proves you once owned documents; it does not prove you are trustworthy, and it costs you your privacy permanently.",
      },
      {
        heading: "What the Republic proves instead",
        body: "A CryptRepublic passport carries a unique fingerprint — the hash of the declared name, sealed on-chain — and the attestations of seven standing citizens who each signed a statement that the applicant is real, singular, and uncoerced. That is the zero-knowledge trust: a verifier can confirm the passport is genuine, unique, and vouched for, without learning the holder's legal identity. The name itself lives on-chain only as a hash; the citizen decides when to reveal what it hashes to.",
      },
      {
        heading: "Using NO-KYC",
        body: "Services that accept the Republic's zero-trust KYC can verify a citizen through One-Portal: the citizen proves control of the passport wallet, the service reads the public record — passport valid, seven attestations, trust score in good standing — and no document changes hands. The citizen discloses nothing except the fact of citizenship and whatever they choose to add.\n\nBecause every attestation is a witness's own standing on the line (a false attestation is a Grade III offence under the Penal Code), the vouching is not a formality — it is collateral.",
      },
    ],
  },
  {
    slug: "the-passport",
    title: "The passport",
    standfirst:
      "One soulbound token: your identity, your vote, your claim, and your standing. It cannot be bought, sold, or taken — only earned.",
    theme: "Identity & entry",
    related: ["passport-utility", "user-signup", "oath-anthem"],
    sections: [
      {
        heading: "What it is",
        body: "The passport is a soulbound token on the public chain — non-transferable by contract, so it cannot be sold, pledged, or seized. It records four things: the hash of your declared name, your motto, your domicile, and the fact that you swore the Oath of Citizenship. Nothing else. No photograph, no birthday, no address book.",
      },
      {
        heading: "How it is minted",
        body: "The mint transaction is signed by YOUR wallet, never the Republic's — the server holds no key and cannot mint on your behalf. You present your declared name (hashed client-side), your motto and domicile (each a short on-chain string), your oath, and the signed attestations of seven witnesses. The passport contract verifies every witness signature on-chain, and if all seven stand, the token is sealed to your address in one transaction.",
      },
      {
        heading: "What it does",
        body: "The passport is the key to everything civic: one vote on every proposal, an equal share of every dividend epoch, eligibility to witness and refer, and the identity behind certificates, directives, and the trust score. Anyone can verify a passport against the chain without an account — verification is a public right, not a service tier.\n\nCitizenship ends only by your renunciation. The Penal Code can lower standing; it cannot un-citizen you.",
      },
    ],
  },
  {
    slug: "witness-attestation",
    title: "Witness attestation",
    standfirst:
      "Citizens witness citizens. Seven signed statements — not a corporation, not a document check — are what seal a passport.",
    theme: "Identity & entry",
    related: ["witness-attestation", "referrals", "user-signup"],
    sections: [
      {
        heading: "The ceremony",
        body: "Before an applicant can mint, seven standing citizens must each sign an attestation: a typed, structured statement binding the witness to that applicant. Each attestation names the applicant's address, the hash of their declared name, a one-time nonce, and a deadline. The witness signs it with their own wallet, on their own device.",
      },
      {
        heading: "Why it cannot be forged or reused",
        body: "Attestations use the EIP-712 typed-data standard under the passport contract's own domain, so a signature produced for CryptRepublic verifies nowhere else and vice versa. The nonce ties each attestation to one specific application — a captured signature cannot be replayed for a second applicant or a second attempt. The deadline expires stale signatures. At mint time the contract itself recovers all seven signers and checks each is a standing citizen; the server's opinion is never the deciding voice.",
      },
      {
        heading: "The witness's stake",
        body: "Witnessing is not a click-through. A witness ordinarily attests for people they referred — people they actually know. An attestation given to an applicant the witness knows to be false, duplicate, or coerced is a Grade III offence under the Penal Code: the witness's trust score answers for it, and witness eligibility is suspended. Seven honest signatures are the Republic's border control, and the border is guarded by the citizens themselves.",
      },
    ],
  },

  // ─── TRUST & STANDING ────────────────────────────────────────────────────
  {
    slug: "trust-score",
    title: "The trust score",
    standfirst:
      "A civic score from 0 to 100, computed from honest signals every time it is read — never fabricated, never bought.",
    theme: "Trust & standing",
    related: ["trust-score", "user-profiling", "referrals"],
    sections: [
      {
        heading: "Five signals, twenty points each",
        body: "The score is the sum of five bounded sub-scores, each capped at 20:\n\n- Citizenship — 20 points for holding a sealed passport.\n\n- Tenure — one point per day of citizenship (measured in chain blocks), reaching the 20-point ceiling after roughly twenty days.\n\n- Referrals — 4 points for each person you referred who went on to become a citizen.\n\n- Governance — 4 points per proposal you have voted on.\n\n- Dividends — 4 points per dividend epoch you have claimed.",
      },
      {
        heading: "Computed on read",
        body: "There is no stored score to tamper with. Every time the score is shown, it is recomputed from the chain: your passport, your mint block, your referrals' passports, your votes, your claims. The only persisted input is an administrative adjustment — a signed delta applied under the Penal Code, with every change entered in the audit register with its reason. The final score is the computed value plus the adjustment, clamped to 0–100.",
      },
      {
        heading: "What standing unlocks",
        body: "A score above 50 lets you refer new applicants freely; at or below 50, each referral consumes a referral token. Standing also drives witness eligibility, tender access, and visa capabilities as those services come into force. The score is read-only to you and everyone else — it is a mirror of participation, and the only way to raise it is to participate.",
      },
    ],
  },
  {
    slug: "referrals",
    title: "Referrals",
    standfirst:
      "The Republic grows one vouched-for person at a time. Referring is a right of standing — and the first step toward witnessing.",
    theme: "Trust & standing",
    related: ["referrals", "trust-score", "witness-attestation"],
    sections: [
      {
        heading: "Creating a referral",
        body: "You refer a person by the email they registered with — never by wallet address, so the edge is always between accountable accounts. The Republic records who referred whom and when. Referring yourself, referring an existing citizen, and referring the same person twice are all rejected at the gate.",
      },
      {
        heading: "The gate: trust or token",
        body: "If your trust score exceeds 50, you refer freely — standing is your licence. At 50 or below, a referral consumes one referral token from a balance the Republic allocates. The spend is transactional and race-guarded: a token can never be double-spent or driven below zero, even by simultaneous requests. Exactly 50 does not qualify; the threshold must be exceeded.",
      },
      {
        heading: "Why referrals matter",
        body: "Referral is the on-ramp to the witness ceremony: you may witness (attest for) the people you referred, which is how seven honest signatures assemble around a genuine newcomer. And referrals repay standing — every referred person who becomes a citizen adds 4 points to your trust score, up to the 20-point cap. The Referral Contract in the documents registry sets out the duties on both sides; selling referrals or manufacturing attestation rings is an offence under the Penal Code.",
      },
    ],
  },
  {
    slug: "governance-and-votes",
    title: "Governance and votes",
    standfirst:
      "The parliament never adjourns. Every proposal is on-chain, every passport carries one vote, and every tally can be checked by anyone.",
    theme: "Trust & standing",
    related: ["passport-utility", "trust-score", "user-dashboard"],
    sections: [
      {
        heading: "One passport, one vote",
        body: "Voting power in the Republic attaches to the passport, not to wealth: one sealed passport is one vote on every proposal, and no office or token balance multiplies it. Because the passport is soulbound, votes cannot be bought by buying identities — the identity does not transfer.",
      },
      {
        heading: "How a vote is cast",
        body: "Proposals live in the governance contract on the public chain. To vote, your own wallet signs the voting transaction — the Republic's servers cannot vote for you, cannot alter your vote, and cannot see it before the chain does. The tally is the contract's own arithmetic: yea, nay, and abstain, readable by any block explorer at any moment, with quorum rules enforced in code rather than in minutes of a meeting.",
      },
      {
        heading: "Votes and standing",
        body: "Participation is counted: each proposal you vote on contributes 4 points to the governance signal of your trust score, up to its 20-point cap. This is deliberate constitutional design — the citizens who steer the Republic are the ones who show up, and showing up is rewarded with standing rather than payment. Abstention is a recorded position, not an absence; it counts as participation.",
      },
    ],
  },

  // ─── ECONOMY & TREASURY ──────────────────────────────────────────────────
  {
    slug: "dividends",
    title: "Dividends",
    standfirst:
      "A state that pays its citizens. Dividends are declared by epoch from the sovereign holdings and claimed by each citizen's own wallet.",
    theme: "Economy & treasury",
    related: ["dividends", "trust-score", "passport-utility"],
    sections: [
      {
        heading: "The epoch",
        body: "A dividend is declared as an epoch on the distributor contract. Each epoch records the amount distributed, the census of citizens at declaration, and the resulting per-citizen share — an equal division, the same for the newest citizen as for the first. The record is on-chain: what an epoch contains is not a press release, it is a contract read.",
      },
      {
        heading: "Claiming",
        body: "Nothing is pushed to you, because the Republic cannot push — it does not hold your wallet. Each citizen claims their own share by signing a claim transaction with their own wallet against their passport. An unclaimed share does not expire into the treasury's pocket; it remains claimable. Your claim history is public chain data, and each claimed epoch adds 4 points to the dividend signal of your trust score, up to its cap.",
      },
      {
        heading: "Where dividends come from",
        body: "Epochs are funded from the sovereign treasury — the Republic's own holdings and their yield, never from citizen deposits (there are none). The chain from source to citizen is fully auditable: treasury reserves are public reads, epoch declarations are public events, and claims are public transactions. If the arithmetic ever failed to add up, any citizen could prove it in an afternoon. That auditability, not any promise, is the guarantee.",
      },
    ],
  },
  {
    slug: "treasury-and-holdings",
    title: "The treasury and sovereign holdings",
    standfirst:
      "The common wealth of the Republic sits in a contract anyone can read — reserves, disbursements, and all.",
    theme: "Economy & treasury",
    related: ["dividends", "user-staking", "user-dashboard"],
    sections: [
      {
        heading: "A treasury you can audit",
        body: "The sovereign treasury is a smart contract holding the Republic's coin and its chain-native reserves. Its balance is not reported — it is read: any citizen, and any stranger, can query the reserves at any block and get the same answer the Chancellor would. The holdings pages on this site display those live reads, and when the site and the chain disagree, the chain is the record.",
      },
      {
        heading: "What goes out, and how",
        body: "The treasury disburses in two audited ways: dividend epochs to the distributor (from which citizens claim their own shares) and recorded disbursements for the operations of the state. Every outflow is an on-chain event with an amount and a destination. What the treasury cannot do is written in its absence of code: it has no function to touch a citizen's personal funds, because it never has them.",
      },
      {
        heading: "Staking and the future of yield",
        body: "Citizen staking with the Republic's validators is on the registry as a planned service — financial rails arrive only after audit, in keeping with the Republic's rule that no money-moving surface ships before its safety case. Until then, the treasury's growth comes from its own sovereign holdings, and its books remain what they have been from block one: open.",
      },
    ],
  },
  {
    slug: "citizen-store",
    title: "The citizen store",
    standfirst:
      "A marketplace where the Republic keeps the register and the citizens keep the money. Settlement never passes through the state.",
    theme: "Economy & treasury",
    related: ["store", "trust-score", "wallet"],
    sections: [
      {
        heading: "Listing and inquiring",
        body: "Any citizen may list — goods, services, collectibles, or other — with a title, a description, and an asking price in the Republic's coin. The price is a statement of intent, not an escrow amount. Buyers open inquiries on a listing: a message thread between citizen and citizen, held in the registry so both sides have the same record. A listing moves through plain statuses — active, sold, withdrawn — set by its seller.",
      },
      {
        heading: "Peer-to-peer settlement",
        body: "When buyer and seller agree, payment travels directly from one citizen's wallet to the other's, on-chain, signed by the payer. The Republic takes no custody, no cut, and no side: it is not a payment processor and holds no funds to freeze or release. This is a constitutional constraint, not a missing feature — the state that cannot hold your money is the state that cannot lose it.",
      },
      {
        heading: "Trust in trade",
        body: "What the Republic does bring to the market is standing. Every counterparty has a passport and a trust score built from public signals, and a verified fraud in trade is a Grade IV offence under the Penal Code — answered in the offender's standing, on the record, for every future counterparty to see. Reputation is the store's escrow.",
      },
    ],
  },

  // ─── WALLET & INSTRUMENTS ────────────────────────────────────────────────
  {
    slug: "sovereign-wallet",
    title: "The sovereign wallet",
    standfirst:
      "Three ways to hold your keys — and no way for the Republic to hold them. Non-custodial is not a policy here; it is the architecture.",
    theme: "Wallet & instruments",
    related: ["wallet", "biometrics", "one-portal"],
    sections: [
      {
        heading: "Three modes, one rule",
        body: "The wallet runs in the mode you choose. EMBEDDED keeps an encrypted vault on your own device, in your browser's storage — the keys are generated there and never leave. HARDWARE connects an external wallet or hardware signer you already own. WATCH-ONLY holds just a public address for viewing, with signing done on a separate, air-gapped device via QR codes. In every mode the rule is identical: signing happens on your hardware, under your hand.",
      },
      {
        heading: "What the server can and cannot do",
        body: "The Republic's servers relay transactions; they never author them. The RPC proxy the app uses accepts only an allow-list of read methods and the broadcasting of transactions ALREADY SIGNED by you — a request asking the server to sign or send on its own authority is rejected by design. The server stores public data only: addresses, signatures, hashes. There is no key ceremony, no recovery desk, and no admin who can move your funds, because there is nothing on the Republic's side capable of it.",
      },
      {
        heading: "What this asks of you",
        body: "Sovereignty has a price: your seed phrase is yours alone, and the Republic cannot reset it. Write it down, keep it offline, and treat any person or page asking for it as an attacker — no organ of the Republic will ever ask. The Charter of Rights makes self-custody a right; this wallet makes it the default.",
      },
    ],
  },
  {
    slug: "signing-and-certificates",
    title: "Signing and certificates",
    standfirst:
      "Sign a statement with your wallet and anyone on earth can verify it — no account, no notary, no fee.",
    theme: "Wallet & instruments",
    related: ["certificates", "passport-utility", "wallet"],
    sections: [
      {
        heading: "What a certificate is",
        body: "A signed certificate is a public attestation: a message or a document, signed client-side by your wallet, and entered in the registry under a human-readable serial. The registry stores only public material — the title, the hash of the signed content, your signing address, and the signature itself. For a document, the document's fingerprint (its hash) is recorded rather than the file, so the content stays with you.",
      },
      {
        heading: "How verification works",
        body: "Anyone holding the certificate's serial can check it: the verifier recomputes the content hash, recovers the signer's address from the signature, and compares both against the registry record and the chain. If one character of the content had changed, the hash would not match; if anyone but the keyholder had signed, the recovered address would differ. Verification is open to the public, without an account — a certificate that only the Republic could check would be a certificate of nothing.",
      },
      {
        heading: "Revocation and standing",
        body: "A certificate can be revoked by its author, which marks the record without erasing it — history is corrected by addendum, not deletion. Certificates carry the weight of their signer's standing: a forged or fraudulent certificate is a Grade IV offence under the Penal Code. The signature is yours; so is the responsibility.",
      },
    ],
  },
  {
    slug: "bitwill-inheritance",
    title: "BitWill: inheritance",
    standfirst:
      "A wallet-signed directive that tells the world what you intend for your estate — without ever giving anyone your keys.",
    theme: "Wallet & instruments",
    related: ["bitwill", "certificates", "wallet"],
    sections: [
      {
        heading: "What a directive is",
        body: "A BitWill directive is a signed, off-chain declaration of intent: it names a beneficiary — by name and contact, optionally with a wallet address — and describes the estate in your own words. Your wallet signs the directive's canonical form; the registry stores the beneficiary details, the directive's hash, your signing address, and the signature. It is a document, in the oldest sense: a durable, attributable statement of will.",
      },
      {
        heading: "What it deliberately is not",
        body: "The directive holds no keys, no seed phrases, and no power to move funds — the memo field is for describing assets, never for storing secrets, and the Republic will not accept a secret into it. This is the honest boundary of a non-custodial state: the Republic can keep your stated intent faithfully and prove it unaltered by its hash and signature, but the transfer of the assets themselves remains where your keys are — with you, and with whatever arrangements you make for them.",
      },
      {
        heading: "The life of a directive",
        body: "A directive stands as ACTIVE until you revoke it or replace it; signing a new one supersedes the old, and every state is recorded with its date. Because each directive is wallet-signed, a beneficiary or executor can later verify — against the signature and hash — that the document they hold is exactly what you signed. Pair the directive with a signed certificate for statements you want independently verifiable by serial.",
      },
    ],
  },
  {
    slug: "citizen-insurance",
    title: "Citizen insurance",
    standfirst:
      "Cover under the Republic's registry: apply for asset or health cover, follow your application on the record, and pay no premium through the state.",
    theme: "Wallet & instruments",
    related: ["insurance", "trust-score", "user-dashboard"],
    sections: [
      {
        heading: "Applying",
        body: "A citizen applies for one of two products: ASSET cover, for property described in the application with a declared value, or HEALTH cover. The application is a registry record in your own words — what you want covered and on what basis. Nothing is signed away and nothing is charged at application; submitting is a registration of interest in cover, not the purchase of a policy.",
      },
      {
        heading: "Review on the record",
        body: "Every application moves through four public-to-you states: SUBMITTED, IN REVIEW, APPROVED, or DECLINED. Review decisions are made by officers of the Republic under the same audit rules as every administrative act — a decision carries a written note, and the Charter of Rights guarantees you the grounds for any decline. The status you see on your dashboard is the status in the register; there is no second, hidden pipeline.",
      },
      {
        heading: "The non-custodial boundary",
        body: "No premiums are collected through the Republic and no claims are paid out of citizen deposits — the state holds no citizen funds to pay them from. As with staking, the financial rails of cover arrive only behind audit and ratification; until then, the insurance registry establishes the part a registry can honestly do: who applied, for what, what was decided, and why — in the open, where an insurance ledger belongs.",
      },
    ],
  },
];

export function knowledgeBySlug(slug: string): KnowledgeArticle | undefined {
  return KNOWLEDGE.find((a) => a.slug === slug);
}

/** articles grouped by theme, preserving article order */
export function knowledgeByTheme(): Record<KnowledgeTheme, KnowledgeArticle[]> {
  const groups = {} as Record<KnowledgeTheme, KnowledgeArticle[]>;
  for (const t of KNOWLEDGE_THEMES) groups[t] = [];
  for (const a of KNOWLEDGE) groups[a.theme].push(a);
  return groups;
}

/** slugify a section heading into a stable anchor id (table of contents) */
export function sectionAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
