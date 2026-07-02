// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

/**
 * GET /api/citizen/obligations. A session whose resolveApplicantAddress -> null
 * (or readPassportStatusServer -> not a citizen) returns an empty obligations set
 * WITHOUT hitting voteByPassport/claimable. A citizen resolves obligations via
 * readMyVoteServer / readClaimableServer keyed by their tokenId.
 */

const APP = "http://localhost:3000";

const h = vi.hoisted(() => ({
  resolvedAddress: null as `0x${string}` | null,
  isCitizen: false,
  tokenId: null as bigint | null,
  proposalCount: 0n,
  myVote: 0,
  currentEpoch: 0n,
  claimable: 0n,
  voteCalled: false,
  claimableCalled: false,
  requiredThrows: false,
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 31337 }),
}));

vi.mock("@/config/contracts", () => ({
  governanceAvailable: () => true,
  distributorAvailable: () => true,
}));

vi.mock("@/lib/applications/applicant", () => ({
  resolveApplicantAddress: async () => h.resolvedAddress,
}));

vi.mock("@/lib/passport/serverReads", () => ({
  readPassportStatusServer: async () => ({ isCitizen: h.isCitizen, tokenId: h.tokenId }),
  readRequiredWitnessesServer: async () => {
    if (h.requiredThrows) throw new Error("unregistered chain");
    return 7;
  },
}));

vi.mock("@/lib/governance/serverReads", () => ({
  readProposalCountServer: async () => h.proposalCount,
  readProposalServer: async (_c: number, id: bigint) => ({
    proposalId: id,
    state: "Active",
    tally: { forVotes: 0n, againstVotes: 0n, abstainVotes: 0n, snapshotCitizens: 0n },
    start: 0n,
    end: 0n,
    proposer: "0x0000000000000000000000000000000000000000",
    descriptionHash: "0x00",
  }),
  readMyVoteServer: async () => {
    h.voteCalled = true;
    return h.myVote;
  },
}));

vi.mock("@/lib/dividends/serverReads", () => ({
  readCurrentEpochServer: async () => h.currentEpoch,
  readClaimableServer: async () => {
    h.claimableCalled = true;
    return h.claimable;
  },
}));

import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET } from "./route";

let userId: string;
let token: string;

function get(cookieToken?: string) {
  const headers: Record<string, string> = {};
  if (cookieToken) headers.cookie = `cr_session=${cookieToken}`;
  return new Request(APP + "/api/citizen/obligations", { headers });
}

/** Reset the fixture user's application to a given state (deletes when null). */
async function setApplication(
  data: {
    status: string;
    witnessNonce?: string | null;
    witnessSignatures?: number;
    adminApprovedAt?: Date | null;
  } | null,
): Promise<void> {
  await prisma.citizenshipApplication.deleteMany({ where: { userId } });
  if (!data) return;
  await prisma.citizenshipApplication.create({
    data: {
      userId,
      status: data.status,
      name: "Obligation Probe",
      adminApprovedAt: data.adminApprovedAt ?? null,
      witnessNonce: data.witnessNonce ?? null,
      witnessDeadline: data.witnessNonce ? "9999999999" : null,
      witnessSignatures: {
        create: Array.from({ length: data.witnessSignatures ?? 0 }, (_, i) => ({
          witnessAddress: `0x${String(i + 1).padStart(40, "0")}`,
          signature: `0x${"ab".repeat(65)}`,
          nonce: data.witnessNonce ?? "0",
          deadline: "9999999999",
        })),
      },
    },
  });
}

describe("GET /api/citizen/obligations", () => {
  beforeAll(async () => {
    // Scoped fixture domain (never @ex.org — see fc7bb7e cross-suite race).
    const user = await prisma.user.create({
      data: { email: `obl${Date.now()}@obligations-route.example` },
    });
    userId = user.id;
    ({ token } = await createSession(userId));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    h.resolvedAddress = null;
    h.isCitizen = false;
    h.tokenId = null;
    h.proposalCount = 0n;
    h.myVote = 0;
    h.currentEpoch = 0n;
    h.claimable = 0n;
    h.voteCalled = false;
    h.claimableCalled = false;
    h.requiredThrows = false;
    await setApplication(null);
  });

  it("401 without a session", async () => {
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  it("empty obligations WITHOUT chain reads when address is null", async () => {
    h.resolvedAddress = null;
    const res = await GET(get(token));
    const body = (await res.json()) as { isCitizen: boolean; obligations: unknown[] };
    expect(body.isCitizen).toBe(false);
    expect(body.obligations).toEqual([]);
    expect(h.voteCalled).toBe(false);
    expect(h.claimableCalled).toBe(false);
  });

  it("empty obligations WITHOUT chain reads when not a citizen", async () => {
    h.resolvedAddress = "0x00000000000000000000000000000000000000a1";
    h.isCitizen = false;
    const res = await GET(get(token));
    const body = (await res.json()) as { isCitizen: boolean; obligations: unknown[] };
    expect(body.isCitizen).toBe(false);
    expect(h.voteCalled).toBe(false);
    expect(h.claimableCalled).toBe(false);
  });

  describe("witness-stage obligations for the applicant (mint waiting on attestations)", () => {
    it("OATH_ACCEPTED with an outstanding request surfaces waiting-with-count (no wallet needed)", async () => {
      await setApplication({ status: "OATH_ACCEPTED", witnessNonce: "5", witnessSignatures: 3 });
      h.resolvedAddress = null; // works even before a wallet is linked
      const res = await GET(get(token));
      const body = (await res.json()) as { obligations: { kind: string; label: string }[] };
      const w = body.obligations.find((o) => o.kind === "witness");
      expect(w).toBeDefined();
      expect(w!.label).toMatch(/waiting for witness attestations/i);
      expect(w!.label).toContain("3 of 7");
    });

    it("omits the count denominator when requiredWitnesses is unreadable (honesty)", async () => {
      await setApplication({ status: "OATH_ACCEPTED", witnessNonce: "5", witnessSignatures: 2 });
      h.requiredThrows = true;
      const res = await GET(get(token));
      const body = (await res.json()) as { obligations: { kind: string; label: string }[] };
      const w = body.obligations.find((o) => o.kind === "witness");
      expect(w).toBeDefined();
      expect(w!.label).toMatch(/waiting for witness attestations/i);
      expect(w!.label).toContain("2 collected");
      expect(w!.label).not.toMatch(/of \d/);
    });

    it("OATH_ACCEPTED without an outstanding request surfaces resume-at-witness-stage", async () => {
      await setApplication({ status: "OATH_ACCEPTED", witnessNonce: null });
      const res = await GET(get(token));
      const body = (await res.json()) as { obligations: { kind: string; label: string }[] };
      const w = body.obligations.find((o) => o.kind === "witness");
      expect(w).toBeDefined();
      expect(w!.label).toMatch(/witness stage/i);
    });

    it("WITNESSED surfaces seal-your-passport", async () => {
      await setApplication({ status: "WITNESSED", witnessNonce: "5", witnessSignatures: 7 });
      const res = await GET(get(token));
      const body = (await res.json()) as { obligations: { kind: string; label: string }[] };
      const w = body.obligations.find((o) => o.kind === "witness");
      expect(w).toBeDefined();
      expect(w!.label).toMatch(/seal your passport/i);
    });

    it("DRAFT/ATTESTED surface NO witness obligation", async () => {
      for (const status of ["DRAFT", "ATTESTED"]) {
        await setApplication({ status });
        const res = await GET(get(token));
        const body = (await res.json()) as { obligations: { kind: string }[] };
        expect(body.obligations.some((o) => o.kind === "witness")).toBe(false);
      }
    });
  });

  describe("admin-approved reflection (Wave 10 A5 — chain-truth gated)", () => {
    it("adminApprovedAt + NOT a citizen → the admin-approved obligation (witness path superseded)", async () => {
      await setApplication({
        status: "OATH_ACCEPTED",
        witnessNonce: "5",
        witnessSignatures: 3,
        adminApprovedAt: new Date(),
      });
      h.resolvedAddress = "0x00000000000000000000000000000000000000a1";
      h.isCitizen = false;
      const res = await GET(get(token));
      const body = (await res.json()) as {
        isCitizen: boolean;
        obligations: { kind: string; label: string }[];
      };
      expect(body.isCitizen).toBe(false);
      const a = body.obligations.find((o) => o.kind === "admin-approved");
      expect(a).toBeDefined();
      expect(a!.label).toBe(
        "An administrator has approved your application; your passport is being issued by the Republic.",
      );
      // Recorded choice: the approval OVERTAKES the witness path.
      expect(body.obligations.some((o) => o.kind === "witness")).toBe(false);
    });

    it("surfaces the approval even BEFORE a wallet is linked (address gate)", async () => {
      await setApplication({
        status: "OATH_ACCEPTED",
        witnessNonce: null,
        adminApprovedAt: new Date(),
      });
      h.resolvedAddress = null;
      const res = await GET(get(token));
      const body = (await res.json()) as { obligations: { kind: string }[] };
      expect(body.obligations.some((o) => o.kind === "admin-approved")).toBe(true);
    });

    it("SUPPRESSED once the chain says citizen — no admin-approved, no witness (addendum #3)", async () => {
      await setApplication({
        status: "OATH_ACCEPTED",
        witnessNonce: "5",
        witnessSignatures: 3,
        adminApprovedAt: new Date(),
      });
      h.resolvedAddress = "0x00000000000000000000000000000000000000a1";
      h.isCitizen = true;
      h.tokenId = 7n;
      const res = await GET(get(token));
      const body = (await res.json()) as {
        isCitizen: boolean;
        obligations: { kind: string }[];
      };
      expect(body.isCitizen).toBe(true);
      expect(body.obligations.some((o) => o.kind === "admin-approved")).toBe(false);
      expect(body.obligations.some((o) => o.kind === "witness")).toBe(false);
    });

    it("no approval → no admin-approved obligation (the witness path is untouched)", async () => {
      await setApplication({ status: "OATH_ACCEPTED", witnessNonce: "5", witnessSignatures: 2 });
      const res = await GET(get(token));
      const body = (await res.json()) as { obligations: { kind: string }[] };
      expect(body.obligations.some((o) => o.kind === "admin-approved")).toBe(false);
      expect(body.obligations.some((o) => o.kind === "witness")).toBe(true);
    });
  });

  it("resolves vote + dividend obligations for a citizen keyed by tokenId", async () => {
    h.resolvedAddress = "0x00000000000000000000000000000000000000a1";
    h.isCitizen = true;
    h.tokenId = 7n;
    h.proposalCount = 1n;
    h.myVote = 0; // not voted -> obligation
    h.currentEpoch = 1n;
    h.claimable = 500n; // unclaimed -> obligation
    const res = await GET(get(token));
    const body = (await res.json()) as {
      isCitizen: boolean;
      tokenId: string;
      obligations: { kind: string }[];
    };
    expect(body.isCitizen).toBe(true);
    expect(body.tokenId).toBe("7");
    expect(h.voteCalled).toBe(true);
    expect(h.claimableCalled).toBe(true);
    expect(body.obligations.some((o) => o.kind === "vote")).toBe(true);
    expect(body.obligations.some((o) => o.kind === "dividend")).toBe(true);
  });
});
