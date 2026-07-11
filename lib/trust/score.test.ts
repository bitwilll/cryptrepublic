// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Hybrid trust score (Wave 12 B1). computed = sum of 5 honest, bounded chain
 * signals (each max 20 → 0..100); finalScore = clamp(computed + adminAdjustment,
 * 0, 100). Every reader is try/catch-guarded so an unreachable chain degrades a
 * signal to 0 (never a throw). Only adminAdjustment is persisted; the rest is
 * computed on read.
 */

const ADDR = "0x00000000000000000000000000000000000000A1" as const;

const h = vi.hoisted(() => ({
  hasPassport: async (_c: number, _a: string) => true,
  citizenLogs: async () => [{ tokenId: 7n, citizen: ADDR, mintBlock: 0n, blockNumber: 0n }],
  headBlock: async () => 1_000_000n, // tenure 1e6 blocks → floor/43200 = 23 → capped 20
  proposalCount: async () => 5n,
  myVote: async () => 1, // voted on every proposal
  dividendHistory: async () => [1, 2, 3, 4, 5], // 5 claims
  referralEdges: async () => [
    { referredUserId: "r1" },
    { referredUserId: "r2" },
    { referredUserId: "r3" },
    { referredUserId: "r4" },
    { referredUserId: "r5" },
  ],
  resolveAddr: async (_id: string) => ADDR,
  linkedWallets: async () => [] as { address: string }[],
  witnessCount: async () => 0,
  certCount: async () => 0,
  endorseCount: async () => 0,
  penalAgg: async () => ({ _sum: { penalty: null as number | null }, _count: { _all: 0 } }),
}));

vi.mock("@/lib/passport/serverReads", () => ({
  readHasPassportServer: (c: number, a: string) => h.hasPassport(c, a),
  readCitizenMintedLogsServer: () => h.citizenLogs(),
  readHeadBlockServer: () => h.headBlock(),
}));
vi.mock("@/lib/governance/serverReads", () => ({
  readProposalCountServer: () => h.proposalCount(),
  readMyVoteServer: () => h.myVote(),
}));
vi.mock("@/lib/dividends/serverReads", () => ({
  readDividendHistoryServer: () => h.dividendHistory(),
}));
vi.mock("@/lib/applications/applicant", () => ({
  resolveApplicantAddress: (id: string) => h.resolveAddr(id),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    referral: { findMany: () => h.referralEdges() },
    linkedWallet: { findMany: () => h.linkedWallets() },
    witnessSignature: { count: () => h.witnessCount() },
    signedCertificate: { count: () => h.certCount() },
    projectEndorsement: { count: () => h.endorseCount() },
    citizenReport: { aggregate: () => h.penalAgg() },
  },
}));

import { computeTrustScore } from "./score";

const CITIZEN = { userId: "u1", address: ADDR, tokenId: 7n };

beforeEach(() => {
  h.hasPassport = async () => true;
  h.citizenLogs = async () => [{ tokenId: 7n, citizen: ADDR, mintBlock: 0n, blockNumber: 0n }];
  h.headBlock = async () => 1_000_000n;
  h.proposalCount = async () => 5n;
  h.myVote = async () => 1;
  h.dividendHistory = async () => [1, 2, 3, 4, 5];
  h.referralEdges = async () => [
    { referredUserId: "r1" },
    { referredUserId: "r2" },
    { referredUserId: "r3" },
    { referredUserId: "r4" },
    { referredUserId: "r5" },
  ];
  h.resolveAddr = async () => ADDR;
  h.linkedWallets = async () => [];
  h.witnessCount = async () => 0;
  h.certCount = async () => 0;
  h.endorseCount = async () => 0;
  h.penalAgg = async () => ({ _sum: { penalty: null }, _count: { _all: 0 } });
});

describe("computeTrustScore", () => {
  it("a maxed-out citizen scores computed=100 (all five signals capped at 20)", async () => {
    const s = await computeTrustScore(84532, CITIZEN, 0);
    expect(s.signals.isCitizen).toBe(true);
    expect(s.signals.referralsBecameCitizens).toBe(5);
    expect(s.signals.governanceVotes).toBe(5);
    expect(s.signals.dividendClaims).toBe(5);
    expect(s.computed).toBe(100);
    expect(s.finalScore).toBe(100);
  });

  it("finalScore clamps to [-100,100] after folding adminAdjustment (Wave 17: negative standing allowed)", async () => {
    expect((await computeTrustScore(84532, CITIZEN, 50)).finalScore).toBe(100); // 100+50 → 100
    h.dividendHistory = async () => []; // drop 20 → computed 80
    h.myVote = async () => 0; // drop 20 → computed 60
    // The statute ("the score may go negative") replaced the old 0 floor.
    expect((await computeTrustScore(84532, CITIZEN, -70)).finalScore).toBe(-10); // 60-70 → -10
    expect((await computeTrustScore(84532, CITIZEN, -500)).finalScore).toBe(-100); // floor -100
  });

  it("civic activity (Wave 17) adds up to 10 points from DB-real acts", async () => {
    h.dividendHistory = async () => []; // computed base 80
    h.linkedWallets = async () => [{ address: ADDR }];
    h.witnessCount = async () => 2; // 2×2 = 4
    h.certCount = async () => 3; // +3
    h.endorseCount = async () => 1; // +1 → 8 civic points
    const s1 = await computeTrustScore(84532, CITIZEN, 0);
    expect(s1.signals.witnessAttestationsGiven).toBe(2);
    expect(s1.computed).toBe(88);
    h.witnessCount = async () => 50; // way past the cap
    const s2 = await computeTrustScore(84532, CITIZEN, 0);
    expect(s2.computed).toBe(90); // 80 + capped 10
  });

  it("verified conduct reports subtract their penalties and can drive standing negative", async () => {
    h.dividendHistory = async () => [];
    h.myVote = async () => 0; // computed 60
    h.penalAgg = async () => ({ _sum: { penalty: -75 }, _count: { _all: 2 } });
    const s = await computeTrustScore(84532, CITIZEN, 0);
    expect(s.signals.penalPoints).toBe(-75);
    expect(s.signals.verifiedReportCount).toBe(2);
    expect(s.finalScore).toBe(-15); // 60 - 75, below zero per the statute
  });

  it("a non-citizen (no address) zeroes the citizen-dependent signals; adminAdjustment still applies", async () => {
    const s = await computeTrustScore(84532, { userId: "u1", address: null, tokenId: null }, 60);
    expect(s.signals.isCitizen).toBe(false);
    expect(s.signals.governanceVotes).toBe(0);
    expect(s.signals.dividendClaims).toBe(0);
    // referrals-became-citizens is independent of the referrer's own citizenship.
    expect(s.signals.referralsBecameCitizens).toBe(5);
    expect(s.computed).toBe(20); // only the referral sub-score (min(20, 5*4))
    expect(s.finalScore).toBe(80); // 20 + 60
  });

  it("partial signals: 2 referrals-became-citizens and 3 votes → bounded sub-scores", async () => {
    h.referralEdges = async () => [{ referredUserId: "r1" }, { referredUserId: "r2" }];
    let calls = 0;
    h.myVote = async () => (++calls <= 3 ? 1 : 0); // 3 of 5 proposals voted
    h.dividendHistory = async () => [];
    const s = await computeTrustScore(84532, CITIZEN, 0);
    expect(s.signals.referralsBecameCitizens).toBe(2);
    expect(s.signals.governanceVotes).toBe(3);
    // 20 (citizen) + 20 (tenure) + 8 (2*4) + 12 (3*4) + 0 = 60
    expect(s.computed).toBe(60);
  });

  it("a throwing reader degrades that signal to 0 (never throws)", async () => {
    h.dividendHistory = async () => {
      throw new Error("distributor unreachable");
    };
    h.myVote = async () => {
      throw new Error("governance unreachable");
    };
    const s = await computeTrustScore(84532, CITIZEN, 0);
    expect(s.signals.dividendClaims).toBe(0);
    expect(s.signals.governanceVotes).toBe(0);
    // 20 (citizen) + 20 (tenure) + 20 (referrals) = 60
    expect(s.computed).toBe(60);
    expect(s.finalScore).toBe(60);
  });
});
