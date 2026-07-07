/**
 * THE REGISTRY OF OFFICIAL DOCUMENTS (Wave 15) — every instrument on the
 * Cabinet's board, transcribed as typed content. Documents WITH a `body` render
 * a full page at /documents/[slug]; stationery items without one render as CSS
 * specimens on the index.
 *
 * `body` is markdown-ish plain text:
 *   - "## Heading"  → a section heading
 *   - blank line    → paragraph break
 *   - "- item"      → a list (consecutive "- " lines form one list)
 *   - single "\n"   → a line break INSIDE a paragraph (verses, letter blocks)
 * Rendered by components/registry/DocumentBody.tsx — no markdown library.
 *
 * Content is aligned with the app as built: non-custodial keys, seven witness
 * attestations, a soulbound passport, dividends from sovereign holdings, and
 * the hybrid trust score (lib/trust/score.ts).
 */

export type DocumentKind = "statute" | "ceremonial" | "legal" | "stationery" | "instrument";

export interface StateDocument {
  /** stable kebab-case slug — /documents/[slug] when `body` exists */
  slug: string;
  title: string;
  kind: DocumentKind;
  /** one-line index summary */
  summary: string;
  /** full text (see format above); absent → index-only specimen */
  body?: string;
}

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  statute: "Statute",
  ceremonial: "Ceremonial",
  legal: "Legal",
  stationery: "Stationery",
  instrument: "Instrument",
};

export const DOCUMENTS: readonly StateDocument[] = [
  // ─── STATUTES ────────────────────────────────────────────────────────────
  {
    slug: "constitution",
    title: "The Constitution",
    kind: "statute",
    summary: "The founding statute of the Republic — citizenship, treasury, governance, and law.",
    body: `## Preamble

We, the citizens of CryptRepublic, resolved that a state is made of consent and not of soil, do ordain this Constitution. We hold that identity belongs to the person, that keys belong to their holder, that record belongs to the public chain, and that government belongs to those it governs. Upon these four foundations the Republic is built, and against them every act of the Republic shall be measured.

## Article I — The Republic

The Republic is a network state. Its territory is the ledger; its census is the passport registry; its border is cryptographic proof. The Republic exercises no custody over the person or property of any citizen. It stores no private key, no seed, and no secret of any citizen, and no organ of the Republic may be granted the power to do so.

## Article II — Citizenship

Citizenship is acquired by oath and by witness. An applicant shall declare a name, swear the Oath of Citizenship, and present the attestations of seven standing citizens, each given as a signed statement binding the witness to the applicant. Upon the sealing of these attestations on the public chain, a passport is issued and the applicant is a citizen. Citizenship is one per person; it may lapse by renunciation, and it may be answered under the Penal Code, but it may not be bought, sold, or transferred.

## Article III — The Passport

The passport is the sole instrument of citizenship. It is a soulbound token: it cannot be transferred, pledged, or seized. It records the citizen's declared name by hash, the citizen's motto and domicile, and the fact of the oath — and nothing more. The passport is proof of standing wherever the Republic is recognised, and its verification is open to anyone without permission or fee.

## Article IV — Governance

The Republic is governed by its citizens in continuous session. Every proposal is put to the passport-holders; every passport carries one vote; every tally is public and verifiable on-chain. Offices of the Republic — Witness, Delegate, Cabinet, and Chancellor — are defined by the National Hierarchy and are held in service of the citizen body, never above it. No office may vote in a citizen's stead.

## Article V — The Treasury and Dividends

The sovereign treasury holds the common wealth of the Republic on the public chain, where any citizen may audit it at any hour. From the yield of the sovereign holdings the Republic declares dividends by epoch: each epoch records its amount and its census of citizens, and each citizen's share is claimable by the citizen's own wallet. The treasury moves no citizen's funds; disbursement is claim, never custody.

## Article VI — Trust and the Civic Score

The Republic maintains for each citizen a civic trust score, computed openly from honest signals: citizenship, tenure, referrals who became citizens, votes cast, and dividends claimed. The score is read, not written; no organ may fabricate it. Adjustments for proven civic wrongs are made only under the Penal Code, in bounded measure, and every adjustment is recorded in the audit register with its reason.

## Article VII — Justice and Penal Principle

No citizen shall be penalised except for an offence defined in the Penal Code, established by evidence, and recorded in public audit. Penalties operate on standing — the trust score and the offices it unlocks — and never on custody: the Republic cannot seize what it does not hold, and it holds nothing. Every penalised citizen has the right to see the record, to answer it, and to appeal to the citizen body.

## Article VIII — Amendment

This Constitution may be amended by proposal put to all passport-holders and ratified by a two-thirds majority of votes cast with quorum. Articles I and II — the non-custodial foundation and the nature of citizenship — may be amended only by a three-quarters majority. Every amendment takes force upon its ratification being sealed on the public chain.`,
  },
  {
    slug: "charter-of-rights",
    title: "Charter of Rights",
    kind: "statute",
    summary: "The enumerated rights of every citizen — privacy, self-custody, exit, and voice.",
    body: `## Preamble

These rights are not granted by the Republic; they are recognised by it. They bind every organ, office, and instrument of the state. Where any act of the Republic conflicts with this Charter, the Charter prevails.

## The Rights

- I. The right of self-custody. Every citizen holds their own keys. No organ of the Republic may take, demand, store, or log a private key, a seed phrase, or any secret capable of moving a citizen's funds.

- II. The right of privacy. The Republic collects only what citizenship requires: an email address, a passphrase held only as a hash, and the public record of the chain. No trackers, no profiles for sale, no surveillance.

- III. The right of exit. Any citizen may renounce citizenship at any time, without penalty, fee, or delay. The Republic exists by consent, and consent may be withdrawn.

- IV. The right of voice. Every passport carries one vote on every proposal. No office, wealth, or tenure multiplies it.

- V. The right of due process. No penalty without a defined offence, evidence on the record, and a written, audited reason. Every penalised citizen may see, answer, and appeal.

- VI. The right of verification. Every claim the Republic makes — census, treasury, tally, dividend — is verifiable by any person on the public chain, without account or permission.

- VII. The right of identity. A citizen's declared name is theirs. The Republic records it by hash and asserts it only as the citizen presented it.

- VIII. The right of anonymity in trust. A citizen may prove standing — seven attestations and a clean score — without disclosing who they are. Zero-knowledge trust is a right, not a feature.

- IX. The right of association. Citizens may witness, refer, trade with, and organise among one another freely. The Republic sets the register; it does not pick the parties.

- X. The right of property. What a citizen holds in their own wallet is theirs absolutely. The Republic cannot freeze, claw back, or redirect it, in law or in code.

- XI. The right of inheritance. Every citizen may direct their estate by signed instrument (BitWill), and the Republic shall keep that record faithfully and disclose it to no one but the citizen.

- XII. The right of equal service. Every service of the Republic is offered to every citizen in good standing on identical terms.`,
  },
  {
    slug: "penal-code",
    title: "The Penal Code",
    kind: "statute",
    summary: "Civic offences, graded penalties, and their trust-score consequences.",
    body: `## Principles

The Republic holds no custody, so it imposes no confiscation. Its penalties operate on STANDING: the civic trust score (0–100) and the eligibilities that standing unlocks — referral rights, offices, tenders, and visa capabilities. Three principles govern every penalty:

- Legality: no penalty except for an offence written here before the act.

- Proportion: the adjustment must match the grade of the offence, within the bounds fixed by this Code.

- Publicity: every adjustment is entered in the audit register with the offence, the evidence, and the officer who ordered it.

## Grades of offence

- Grade I — Civic negligence. Abandoning witness duties mid-attestation; letting a referral languish knowingly; frivolous proposals. Penalty: trust adjustment of −1 to −5.

- Grade II — Misrepresentation. False statements in a store listing, an insurance application, or a public profile; misusing the state brand or seal. Penalty: trust adjustment of −5 to −15 and correction of the record.

- Grade III — Breach of attestation. Witnessing an applicant the witness knows to be false, duplicate, or coerced. Penalty: trust adjustment of −15 to −30 and suspension of witness eligibility.

- Grade IV — Fraud upon a citizen. Deceit in citizen-to-citizen trade, forged certificates, or a false inheritance directive. Penalty: trust adjustment of −30 to −60 and referral of the record to the citizen body.

- Grade V — Fraud upon the Republic. Sybil citizenship, manufactured attestation rings, or corruption of an office. Penalty: trust adjustment to the floor of the scale and forfeiture of every office held.

## Consequences of a fallen score

The score is clamped to the scale: it cannot fall below zero, and a verified offence may hold it at the floor. A citizen below the referral threshold (50) may no longer refer without a token; a citizen at the floor holds citizenship — which no penalty removes — but no office, no witness right, and no tender eligibility until the score is rebuilt by honest participation.

## Restoration

The same signals that build trust rebuild it: tenure, votes cast, referrals who become citizens, and dividends claimed. No officer may bar a penalised citizen from participation itself. Adjustments may be appealed to the citizen body, and a successful appeal reverses the entry in the audit register.`,
  },
  {
    slug: "national-hierarchy",
    title: "The National Hierarchy",
    kind: "statute",
    summary:
      "The five offices of the Republic — from Citizen to Chancellor — and how each is attained.",
    body: `## The order of offices

The Republic knows five stations. Each is earned, none is inherited, and all authority flows upward from the first.

## Citizen

The foundation of the state. Attained by oath and seven witness attestations, sealed on-chain as a soulbound passport. Duties: keep your own keys, vote your own vote, and answer for your own record. Every other office is a citizen first and always.

## Witness

A citizen trusted to vouch. Attained by standing: a citizen in good standing whose trust score qualifies them to sign attestations for applicants — ordinarily those they have referred. Duties: attest only to persons known to be real, singular, and uncoerced; a false attestation is a Grade III offence.

## Delegate

A citizen elected to carry a mandate. Attained by election among the citizens of an embassy or a service domain, for a fixed term. Duties: prepare proposals, report tallies honestly, and surrender the mandate on schedule. A Delegate's vote in the assembly counts the same as any citizen's — one.

## Cabinet

The executive council of the Republic. Attained by election of the full citizen body from among serving or former Delegates. Duties: operate the organs of state — registry, treasury operations, embassies, and the service catalogue — within the budgets and statutes the citizens ratify. The Cabinet proposes; the citizens dispose.

## Chancellor

The first servant of the Republic. Attained by election of the full citizen body, from among serving or former Cabinet members, for a single term. Duties: convene the Cabinet, represent the Republic abroad, and countersign ratified amendments. The Chancellor holds no veto, no emergency power, and no key: like every office, the seal of the Chancellor is a signature, and the signature is the citizen's own.

## The rule of return

Every office ends where it began. On the last day of a term the Delegate, the Cabinet member, and the Chancellor are what they were on the first day of the Republic: a citizen with one passport, one vote, and their own keys.`,
  },

  // ─── CEREMONIAL ──────────────────────────────────────────────────────────
  {
    slug: "oath",
    title: "Oath of Citizenship",
    kind: "ceremonial",
    summary: "The sworn declaration of every applicant, sealed with the passport.",
    body: `## The Oath

I declare my name and stand behind it.
I hold my own keys, and I ask no one to hold them for me.
I will witness truly, vote freely, and trade honestly.
I will keep the record public and my word good.
I join CryptRepublic by my own consent,
and by my own consent I remain —
a citizen of the first network state,
one passport, one voice, one Republic.

## Administration

The oath is affirmed by the applicant during the passport mint and recorded on-chain as part of the sealing transaction. It is sworn once; it binds for the duration of citizenship; and it is released without prejudice upon renunciation. Seven witnesses attest that the person swearing is real, singular, and uncoerced.`,
  },
  {
    slug: "anthem",
    title: "The National Anthem",
    kind: "ceremonial",
    summary: "The anthem of the Republic — sung at oath ceremonies and embassy assemblies.",
    body: `## Verse I

We drew no line on land or sea,
we raised no wall of stone —
our border is a written proof,
our ground, a chain of our own.
From every city, every tongue,
we answered one address:
a name declared, an oath affirmed,
and seven hands said yes.

## Refrain

Rise, CryptRepublic, ledger and light,
kept by our keys through the long open night.
No crown to command us, no vault to confine —
one passport, one people, one state by design.

## Verse II

Our treasury stands in open day
for any eye to read;
our parliament adjourns no night,
our vote is voice and deed.
And when we pass our seal along
to those who follow on,
the record that we kept will stand —
the proof outlives the dawn.

## Refrain

Rise, CryptRepublic, ledger and light,
kept by our keys through the long open night.
No crown to command us, no vault to confine —
one passport, one people, one state by design.

## Protocol

The anthem is sung standing at oath ceremonies, embassy openings, and the ratification of amendments. The refrain alone may be used as a short form.`,
  },
  {
    slug: "citizens-prayer",
    title: "The Citizen's Prayer",
    kind: "ceremonial",
    summary: "A secular, solemn text of reflection spoken before assemblies.",
    body: `## The Prayer

Let me keep what is mine to keep,
and covet nothing held by another.
Let my word, once signed, be stone;
let my witness fall only on the truthful.
Grant me patience with the new citizen,
honesty in the open market,
and courage when the vote is close.
May I leave the record cleaner than I found it,
the treasury fuller, the Republic larger —
and my keys, at the end as at the beginning,
in no hands but my own.

## Usage

The Citizen's Prayer is secular and optional. It is customarily read aloud before embassy assemblies and privately before a citizen casts a difficult vote. It confers no standing and is required for none.`,
  },

  // ─── INSTRUMENTS ─────────────────────────────────────────────────────────
  {
    slug: "treasury-notes",
    title: "Treasury Notes",
    kind: "instrument",
    summary: "How the sovereign treasury is held, audited, and disbursed — an explainer.",
    body: `## What a Treasury Note is

A Treasury Note is the Republic's own record of value held by the sovereign treasury on the public chain. It is not a bank deposit and not a claim on any custodian: the treasury is a smart contract whose reserves — the Republic's coin and its chain-native holdings — are readable by anyone at any block. When the Republic states its reserves, that statement is a query, not a promise.

## How the treasury fills

The treasury accumulates from the Republic's sovereign holdings and their yield. No citizen deposit is required or accepted for citizenship; the Republic never takes custody of a citizen's funds to build its own.

## How the treasury disburses

Disbursement is claim, never transfer-on-your-behalf. The principal instrument is the dividend: the Republic declares an epoch, records the amount and the census of citizens at declaration, and computes each citizen's equal share. Each citizen then claims their own share with their own wallet, in their own time. An unclaimed share remains claimable; the treasury cannot redirect it.

## What the treasury cannot do

- It cannot hold, freeze, or move a citizen's personal funds — it never has them.

- It cannot disburse outside a ratified epoch or an audited disbursement record.

- It cannot conceal its balance: every reserve read is public.

## Reading the notes

The live figures — reserves, current epoch, per-citizen share — are published on the holdings pages and are verifiable directly against the chain by any block explorer. If a figure on this site and the chain ever disagree, the chain is the record.`,
  },
  {
    slug: "smart-cheques",
    title: "Smart Cheques",
    kind: "instrument",
    summary: "Signed, verifiable payment instruments between citizens — an explainer.",
    body: `## What a Smart Cheque is

A Smart Cheque is a signed instruction from one citizen to pay another, written as data instead of paper. Like a paper cheque it names a payer, a payee, an amount, and a date, and carries the payer's signature. Unlike a paper cheque, its signature is cryptographic: anyone can verify who signed it and that not one character has changed since.

## How it works

The payer's wallet signs the cheque CLIENT-SIDE — the signing key never leaves the payer's device, and the Republic never sees it. What may be recorded with the Republic is only the public face of the instrument: the hash of its contents, the signer's public address, and the signature. Settlement, when it happens, is a peer-to-peer on-chain transfer executed by the payer's own wallet.

## What the Republic does — and does not do

The Republic's registry can witness a cheque: record that it existed, when, and under whose signature — the same public attestation it keeps for signed certificates. The Republic does NOT hold the funds, does not execute the payment, cannot cancel or reverse it, and takes no fee on it. A Smart Cheque is an instrument between citizens; the state is its notary, never its bank.

## Standing and disputes

A cheque dishonoured — signed but never settled — may be presented as evidence in a dispute. A verified pattern of dishonoured instruments is misrepresentation under the Penal Code and answers in trust-score standing, which is the Republic's only enforcement: reputational, public, and proportionate.`,
  },

  // ─── LEGAL ───────────────────────────────────────────────────────────────
  {
    slug: "terms",
    title: "Terms & Conditions",
    kind: "legal",
    summary: "The terms on which the Republic's services are offered.",
    body: `## 1. The agreement

These terms govern the use of the CryptRepublic web application and its services. By registering an account or using the services, you accept them. They apply together with the Constitution and the Charter of Rights; where they conflict with the Charter, the Charter prevails.

## 2. The nature of the service

CryptRepublic is a network-state registry and interface. It is NOT a bank, an exchange, a custodian, a broker, or an investment service. The Republic never holds, moves, or controls user funds, and never stores private keys, seed phrases, or any material capable of moving them. Every on-chain action — minting a passport, casting a vote, claiming a dividend, settling a trade — is signed by the user's own wallet on the user's own device.

## 3. Your responsibilities

- You are solely responsible for your keys, your seed phrase, and your devices. Lost keys cannot be recovered by the Republic, because the Republic does not have them.

- You will provide truthful information in applications, listings, and attestations.

- You will not attempt to create more than one citizenship, manufacture attestations, or interfere with the service.

## 4. Citizenship and standing

Citizenship is issued per the Constitution: oath plus seven witness attestations, sealed on-chain. Standing (the trust score) is computed from public signals and may be adjusted only under the Penal Code, with an audited record. Citizenship itself is not revoked by these terms.

## 5. Marketplace, insurance, and estate services

Store listings, insurance applications, inheritance directives, and certificates are registry records. Trades settle peer-to-peer between citizens; the Republic is not a party to them and offers no escrow. Insurance applications are registrations of interest in cover, not policies; no premiums are collected through the service.

## 6. No financial advice

Nothing in the service is investment, legal, or tax advice. Digital assets carry risk; testnet figures are illustrative.

## 7. Availability and changes

The service is provided as-is, without warranty of uninterrupted availability. The chain — not this interface — is the authoritative record. Terms may be amended; material changes will be published in this registry with a new ratification date.

## 8. Termination

You may stop using the service and renounce citizenship at any time. The Republic may suspend ACCOUNT access for violations of these terms — but cannot and does not touch your wallet, your keys, or your on-chain record.`,
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    kind: "legal",
    summary: "What the Republic stores, what it never stores, and who can see what.",
    body: `## The principle

The Republic collects the minimum that citizenship requires, keeps it only as long as required, and sells none of it. This policy describes the entire collection — there is no hidden remainder.

## What we store

- Your email address — your sign-in identifier and the only way the Republic can reach you.

- A hash of your passphrase — the passphrase itself is never stored and cannot be recovered from the hash.

- Public chain data — wallet addresses you present, passport records, attestations, votes, and claims, all of which are already public on the chain.

- Service records you create — referrals, store listings and inquiries, certificate records, inheritance directives, insurance applications, and commissary interests. These contain only what you type into them.

- Passkey public keys — if you enrol a passkey, we store its public half and a counter; the private half never leaves your authenticator.

## What we never store

- Private keys, seed phrases, or wallet entropy — in any form, encrypted or not.

- Payment card numbers or bank details — the Republic takes no payments.

- Tracking profiles — there are no third-party trackers, no advertising pixels, and no analytics that identify you.

## Cookies

One cookie: the session cookie that keeps you signed in. It is HttpOnly, same-site, and deleted on sign-out. There are no marketing cookies.

## Who can see what

Anyone can see what the chain shows — that is its nature. Your email and your service records are visible to you and to administrators acting under the audit rules of the Constitution; every administrative access that changes your record leaves an audit entry.

## Your rights

You may export your records, correct them, or delete your account at any time. Deleting your account removes your email, your hash, and your service records. On-chain records are permanent by design and are not held by the Republic.`,
  },
  {
    slug: "referral-contract",
    title: "Referral Contract",
    kind: "legal",
    summary: "The standing terms between the Republic, a referrer, and a referred applicant.",
    body: `## Parties and purpose

This contract binds the REFERRER (a registered user of the Republic), the REFERRED (the person they name), and the REPUBLIC (as registrar). Its purpose is the orderly growth of the citizen body: citizens vouching for people they actually know.

## 1. The referral

A referral is created when the Referrer names the Referred by their registered email. The Republic records the edge — who referred whom, and when. A referral is not citizenship, not a guarantee of citizenship, and not transferable.

## 2. Eligibility to refer

The right to refer is earned by standing. A Referrer whose trust score exceeds the referral threshold (50) refers freely; otherwise one referral token, allocated by the Republic, is consumed per referral. A referral to oneself, to an existing citizen, or duplicating an existing edge is void and creates no record.

## 3. Duties of the Referrer

- To refer only persons the Referrer believes to be real, singular, and acting freely.

- To assist the Referred toward attestation honestly — a Referrer may witness those they referred.

- Not to sell referrals or manufacture attestation rings; doing so is an offence under the Penal Code (Grades III–V).

## 4. Duties of the Referred

The Referred applies in their own name, swears the oath themselves, and holds their own keys. No Referrer may hold keys, complete an oath, or sign attestations on the Referred's behalf.

## 5. Consideration

The Referrer's consideration is standing: referrals who become citizens raise the Referrer's trust score by the published formula. The Republic promises no payment for referrals; any referral income programme, where ratified, will be published in this registry before it applies.

## 6. Records and audit

Referral edges, token balances, and token consumption are recorded by the Republic and visible to the parties. Disputes are resolved on the record under the Penal Code's due-process rules.`,
  },

  // ─── STATIONERY (with text) ──────────────────────────────────────────────
  {
    slug: "onboarding-letter",
    title: "Onboarding Letter",
    kind: "stationery",
    summary: "The letter issued to a new applicant upon registration.",
    body: `## The letter

OFFICE OF THE REGISTRAR
CRYPTREPUBLIC — NETWORK STATE №001

To: [CITIZEN NAME]
Re: Your application for citizenship
Ref: [APPLICATION №] · [DATE]

Dear [CITIZEN NAME],

The Registry confirms receipt of your application. You are now an applicant of CryptRepublic, and the path before you has three steps.

First, establish your wallet. Your keys are generated on your own device and remain there; the Republic cannot see, store, or recover them. Guard your seed phrase as you would your signature — it IS your signature.

Second, gather your witnesses. Citizenship is sealed by the attestations of seven standing citizens who know you to be real, singular, and acting of your own will. If you were referred, your referrer may stand among them.

Third, swear the oath and mint your passport. The mint is signed by your own wallet; the moment it is sealed on-chain, you are a citizen.

Until then you hold applicant status: you may prepare your wallet, review the Constitution and the Charter of Rights, and study the Knowledgebase. No fee is due — citizenship is not for sale, at any price.

The Republic looks forward to counting you.

By order of the Registrar,
THE STATE REGISTRY
[SIGNATURE BLOCK]`,
  },
  {
    slug: "welcome-letter",
    title: "Citizenship Welcome Letter",
    kind: "stationery",
    summary: "The letter issued upon the sealing of a new passport.",
    body: `## The letter

OFFICE OF THE CHANCELLOR
CRYPTREPUBLIC — NETWORK STATE №001

To: [CITIZEN NAME]
Re: Grant of citizenship
Passport: [PASSPORT №] · Sealed at block [BLOCK №] · [DATE]

Citizen [CITIZEN NAME],

Seven citizens vouched for you. You swore the oath. The chain has sealed it. From this block forward you are a citizen of CryptRepublic, and this letter is the Republic's formal welcome — though the passport in your wallet, not this letter, is the proof.

Your citizenship confers, from today:

- One vote on every proposal put to the citizen body — the parliament never adjourns.

- An equal claim on every dividend epoch declared from the sovereign holdings, claimable by your own wallet.

- Standing to build: a trust score that rises with your tenure, your votes, your claims, and the citizens you bring in.

- The services of the registry — the store, certificates, the estate record, and cover — on the same terms as every citizen.

And it asks of you what the oath said: keep your keys, keep your word, witness truly, and leave the record cleaner than you found it.

Welcome to the Republic. You have been counted.

[SIGNATURE BLOCK]
CHANCELLOR OF CRYPTREPUBLIC
Countersigned — THE STATE REGISTRY`,
  },
  {
    slug: "denial-letter",
    title: "Denial Letter",
    kind: "stationery",
    summary: "The letter issued when an application cannot proceed, with reasons and remedies.",
    body: `## The letter

OFFICE OF THE REGISTRAR
CRYPTREPUBLIC — NETWORK STATE №001

To: [CITIZEN NAME]
Re: Your application for citizenship
Ref: [APPLICATION №] · [DATE]

Dear [CITIZEN NAME],

The Registry has reviewed your application and cannot, at this time, proceed to the seal. The ground for this decision is stated below, as the Charter of Rights requires:

Ground: [STATED GROUND — e.g. the attestation requirement was not met; an attestation was withdrawn or found invalid; the application duplicates an existing citizenship.]

This decision is a denial of the APPLICATION, not a judgment of the person, and it is not permanent. You may:

- Re-apply at any time once the stated ground is resolved — most commonly by gathering the full seven witness attestations from standing citizens.

- Request the record. You are entitled to see the evidence on which this decision rests.

- Appeal. A written appeal will be put before the review officers, and their reasons will be recorded in the audit register.

No fee was taken and none is due. Your wallet and any funds in it are yours and are unaffected by this decision — the Republic never held them.

By order of the Registrar,
THE STATE REGISTRY
[SIGNATURE BLOCK]`,
  },
  {
    slug: "site-app-content",
    title: "Site & App Content",
    kind: "stationery",
    summary: "The editorial style guide for every word the Republic publishes.",
    body: `## Voice

The Republic writes like a state that respects its citizens: formal, confident, and plain. Declarative sentences. No exclamation marks, no emoji, no hedging. We say "the Republic", "citizens", "ratified", "issued", "sealed" — never "users get onboarded".

## Register

- Body copy is sentence case; the design uppercases headings on its own — write headings in sentence case and let the type do the shouting.

- Serials, codes, labels, and kickers are set in the mono face and speak in small caps: REGISTRY №, BLOCK, RATIFIED MMXXVI.

- Numbers are exact where the chain is the source ("48 392 citizens") and honest where it is not ("testnet figures are illustrative").

## Vocabulary

- "Passport", never "profile NFT". "Citizen", never "user", except in strictly technical contexts.

- "Claim", never "receive" — the citizen acts; the Republic does not push funds.

- "Non-custodial" is stated, not implied: keys never leave the citizen's device.

- Statuses are the registry's four words: In service, Beta, In development, Planned.

## Claims discipline

Never promise custody we do not take, yields we do not control, or recognition we do not have. Every number a page shows should be traceable to the chain or marked as illustrative. When in doubt, the copy says less and the record says more.`,
  },
  {
    slug: "advertisement-content",
    title: "Advertisement Content",
    kind: "stationery",
    summary: "The communications doctrine for campaigns, posters, and outreach.",
    body: `## Doctrine

Advertising for a state is testimony, not persuasion. Every campaign asset states what the Republic IS and lets the record argue. We do not promise wealth, we do not count down, and we do not manufacture urgency — the Republic is not running out.

## Approved themes

- Sovereignty of the person: "Your keys. Your name. Your vote."

- The open record: "A state you can audit at 3 a.m."

- The witness ceremony: "Seven citizens said yes."

- The dividend: "A state that pays its citizens, not the reverse."

## Mandatory elements

- The crest, at the sizes and clearances fixed by the brand kit.

- The wordmark CRYPTREPUBLIC with the designation NETWORK STATE №001.

- A verification path: every claim of scale or treasury carries the address or page where it can be checked.

## Prohibitions

- No yield promises, price talk, or "get in early" framing — Grade II misrepresentation under the Penal Code applies to the Republic's own organs too.

- No imagery of custody: vaults, safes, and piggy banks imply we hold funds. We do not.

- No dark patterns in calls to action: "Mint your passport" is an invitation, never a trap.

## Tone test

Before release, read the asset aloud in the voice of a border officer who is proud of their country and bored of lying. If it survives that reading, it ships.`,
  },

  // ─── STATIONERY (specimens — no body; rendered as CSS specimens) ─────────
  {
    slug: "letterhead",
    title: "Letterhead",
    kind: "stationery",
    summary: "The official letter paper of the Republic — crest, rule, and reference block.",
  },
  {
    slug: "business-card",
    title: "Business Card",
    kind: "stationery",
    summary: "The card carried by officers of the state — name, office, and serial.",
  },
  {
    slug: "state-stamp",
    title: "State Stamp",
    kind: "stationery",
    summary: "The circular seal impressed on ratified instruments.",
  },
];

/** documents that render a full page at /documents/[slug] */
export function documentsWithBody(): StateDocument[] {
  return DOCUMENTS.filter((d) => d.body !== undefined);
}

/** stable citation serial ("CR-DOC-001") from position in the registry list */
export function docSerial(slug: string): string {
  const i = DOCUMENTS.findIndex((d) => d.slug === slug);
  return `CR-DOC-${String(i + 1).padStart(3, "0")}`;
}

export function documentBySlug(slug: string): StateDocument | undefined {
  return DOCUMENTS.find((d) => d.slug === slug);
}
