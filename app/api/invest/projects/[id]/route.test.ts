// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET } from "./route";

/**
 * /api/invest/projects/[id] (Wave 16 invest). Asserts the detail contract:
 * session gate, 404 on unknown ids, the full public record + aggregates for
 * everyone, and — the PRIVACY line — the pledge ledger is CREATOR-ONLY, with
 * pledger rows carrying display names only (exact key assertions: no userId,
 * no email, no address ever crosses the wire).
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let creatorId: string;
let backerId: string;
let otherId: string;
let creatorToken: string;
let backerToken: string;
let otherToken: string;
let projectId: string;

function req(id: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `cr_session=${token}`;
  return new Request(`${APP}/api/invest/projects/${id}`, { headers });
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeAll(async () => {
  const [creator, backer, other] = await Promise.all([
    prisma.user.create({ data: { email: `inv-d-c-${suffix}@w16invest.example` } }),
    prisma.user.create({ data: { email: `inv-d-b-${suffix}@w16invest.example` } }),
    prisma.user.create({ data: { email: `inv-d-o-${suffix}@w16invest.example` } }),
  ]);
  creatorId = creator.id;
  backerId = backer.id;
  otherId = other.id;
  ({ token: creatorToken } = await createSession(creatorId));
  ({ token: backerToken } = await createSession(backerId));
  ({ token: otherToken } = await createSession(otherId));

  const project = await prisma.fundraisingProject.create({
    data: {
      creatorUserId: creatorId,
      title: `Detail project ${suffix}`,
      summary: "Detail summary for the invest detail suite.",
      description: "Detail description for the invest detail suite, long enough to pass zod.",
      category: "EDUCATION",
      goalCoin: "100.00",
      status: "ACTIVE",
      treasuryAddress: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
    },
  });
  projectId = project.id;
  await prisma.investmentPledge.create({
    data: { projectId, userId: backerId, amountCoin: "25.50", note: "count me in" },
  });
  await prisma.investmentPledge.create({
    data: { projectId, userId: otherId, amountCoin: "10.00", status: "WITHDRAWN" },
  });
  await prisma.citizenshipApplication.create({
    data: { userId: backerId, status: "MINTED", citizenTokenId: "88" },
  });
});

afterAll(async () => {
  await prisma.fundraisingProject.deleteMany({ where: { creatorUserId: creatorId } });
  await prisma.citizenshipApplication.deleteMany({
    where: { userId: { in: [creatorId, backerId, otherId] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [creatorId, backerId, otherId] } } });
  await prisma.$disconnect();
});

describe("GET /api/invest/projects/[id]", () => {
  it("401 without a session, 404 on an unknown id", async () => {
    expect((await GET(req(projectId), params(projectId))).status).toBe(401);
    expect((await GET(req("nope", creatorToken), params("nope"))).status).toBe(404);
  });

  it("serves everyone the full public record with aggregates and their own pledge", async () => {
    const res = await GET(req(projectId, backerToken), params(projectId));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      project: Record<string, unknown>;
      pledges: unknown;
    };
    expect(data.project.title).toBe(`Detail project ${suffix}`);
    expect(data.project.description).toMatch(/Detail description/);
    expect(data.project.treasuryAddress).toBe("0x8ba1f109551bD432803012645Ac136ddd64DBA72");
    expect(data.project.pledgedTotalCoin).toBe("25.50"); // WITHDRAWN pledge counts for nothing
    expect(data.project.pledgeCount).toBe(1);
    expect(data.project.mine).toBe(false);
    expect(data.project.myPledge).toEqual({
      amountCoin: "25.50",
      note: "count me in",
      status: "PLEDGED",
    });
  });

  it("PRIVACY: a non-creator never receives the pledge ledger — not even their own row in it", async () => {
    const asBacker = (await (await GET(req(projectId, backerToken), params(projectId))).json()) as {
      pledges: unknown;
    };
    expect(asBacker.pledges).toBeNull();

    const asOther = (await (await GET(req(projectId, otherToken), params(projectId))).json()) as {
      pledges: unknown;
      project: { myPledge: { status: string } | null };
    };
    expect(asOther.pledges).toBeNull();
    expect(asOther.project.myPledge).toEqual({
      amountCoin: "10.00",
      note: null,
      status: "WITHDRAWN",
    });
  });

  it("the CREATOR receives the ledger with display names only — exact keys, no identifiers", async () => {
    const res = await GET(req(projectId, creatorToken), params(projectId));
    const data = (await res.json()) as {
      project: { mine: boolean };
      pledges: Array<Record<string, unknown>>;
    };
    expect(data.project.mine).toBe(true);
    expect(data.pledges).toHaveLength(2);

    for (const p of data.pledges) {
      // EXACT shape: display name + the pledge facts. No userId, no email.
      expect(Object.keys(p).sort()).toEqual([
        "amountCoin",
        "createdAt",
        "note",
        "pledgerDisplay",
        "status",
      ]);
    }
    const pledged = data.pledges.find((p) => p.status === "PLEDGED")!;
    expect(pledged.pledgerDisplay).toBe("Citizen № 88"); // cached tokenId, never the email
    expect(pledged.amountCoin).toBe("25.50");
    expect(pledged.note).toBe("count me in");
    const withdrawn = data.pledges.find((p) => p.status === "WITHDRAWN")!;
    expect(withdrawn.pledgerDisplay).toBe("Applicant");
    expect(JSON.stringify(data.pledges)).not.toMatch(/@w16invest\.example/);
  });
});
