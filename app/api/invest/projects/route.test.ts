// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET, POST } from "./route";

/**
 * /api/invest/projects (Wave 16 invest). Real prisma against the shared
 * sqlite test db — list assertions therefore use contains/find (other suites
 * seed projects in parallel); ?mine=1 assertions are exact (user-scoped).
 * Asserts: session gate on GET, the ACTIVE default board, the SUBMITTED
 * endorsement queue, BigInt-cents aggregates (pledged total / counts /
 * community-backed at 7), myPledge/myEndorsement/mine scoping, creator
 * display via the cached citizen token, and the create contract (origin 403 /
 * auth 401 / zod 400s / checksum 400s / verbatim goalCoin / SUBMITTED start /
 * 1-open-fundraiser cap).
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const CHECKSUMMED = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";

let creatorId: string;
let backerId: string;
let thirdId: string;
let creatorToken: string;
let backerToken: string;
const extraUserIds: string[] = [];

function getReq(qs = "", opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/invest/projects${qs}`, { headers });
}
function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/invest/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: `Harbour beacon ${suffix}`,
    summary: "A solar navigation beacon for the Republic's harbour mouth.",
    description:
      "Fabricate and install a solar-powered navigation beacon at the harbour mouth, maintained by volunteer keepers.",
    category: "INFRASTRUCTURE",
    goalCoin: "2500.00",
    ...overrides,
  };
}
async function seedProject(
  data: Partial<{
    creatorUserId: string;
    title: string;
    status: string;
    goalCoin: string;
  }> = {},
) {
  return prisma.fundraisingProject.create({
    data: {
      creatorUserId: data.creatorUserId ?? creatorId,
      title: data.title ?? `Seeded project ${suffix}`,
      summary: "Seeded summary for the invest route suite.",
      description: "Seeded description for the invest route suite, long enough to pass.",
      category: "TECHNOLOGY",
      goalCoin: data.goalCoin ?? "1000.00",
      status: data.status ?? "ACTIVE",
    },
  });
}

type Item = {
  id: string;
  title: string;
  summary: string;
  category: string;
  goalCoin: string;
  treasuryAddress: string | null;
  status: string;
  createdAt: string;
  creatorDisplay: string;
  pledgedTotalCoin: string;
  pledgeCount: number;
  endorsementCount: number;
  communityBacked: boolean;
  myPledge: { amountCoin: string; note: string | null; status: string } | null;
  myEndorsement: boolean;
  mine: boolean;
};
async function listItems(qs: string, token: string): Promise<Item[]> {
  const res = await GET(getReq(qs, { token }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { projects: Item[] }).projects;
}

beforeAll(async () => {
  const [creator, backer, third] = await Promise.all([
    prisma.user.create({ data: { email: `inv-p-c-${suffix}@w16invest.example` } }),
    prisma.user.create({ data: { email: `inv-p-b-${suffix}@w16invest.example` } }),
    prisma.user.create({ data: { email: `inv-p-t-${suffix}@w16invest.example` } }),
  ]);
  creatorId = creator.id;
  backerId = backer.id;
  thirdId = third.id;
  ({ token: creatorToken } = await createSession(creatorId));
  ({ token: backerToken } = await createSession(backerId));
});

afterAll(async () => {
  const ids = [creatorId, backerId, thirdId, ...extraUserIds];
  await prisma.fundraisingProject.deleteMany({ where: { creatorUserId: { in: ids } } });
  await prisma.citizenshipApplication.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("GET /api/invest/projects", () => {
  it("401 without a session (the register is citizens-only)", async () => {
    expect((await GET(getReq())).status).toBe(401);
  });

  it("400 on a status outside ACTIVE|SUBMITTED", async () => {
    expect((await GET(getReq("?status=DECLINED", { token: backerToken }))).status).toBe(400);
    expect((await GET(getReq("?status=weird", { token: backerToken }))).status).toBe(400);
  });

  it("defaults to the ACTIVE board and never leaks other statuses into it", async () => {
    const active = await seedProject({ title: `Board active ${suffix}` });
    const submitted = await seedProject({
      title: `Board submitted ${suffix}`,
      status: "SUBMITTED",
    });
    const declined = await seedProject({ title: `Board declined ${suffix}`, status: "DECLINED" });

    const items = await listItems("", backerToken);
    expect(items.some((p) => p.id === active.id)).toBe(true);
    expect(items.some((p) => p.id === submitted.id)).toBe(false);
    expect(items.some((p) => p.id === declined.id)).toBe(false);
    expect(items.every((p) => p.status === "ACTIVE")).toBe(true);

    const queue = await listItems("?status=SUBMITTED", backerToken);
    expect(queue.some((p) => p.id === submitted.id)).toBe(true);
    expect(queue.every((p) => p.status === "SUBMITTED")).toBe(true);

    await prisma.fundraisingProject.deleteMany({
      where: { id: { in: [active.id, submitted.id, declined.id] } },
    });
  });

  it("computes pledge aggregates in BigInt cents and scopes myPledge to the caller", async () => {
    const project = await seedProject({ title: `Aggregates ${suffix}`, goalCoin: "10.00" });
    await prisma.investmentPledge.create({
      data: { projectId: project.id, userId: backerId, amountCoin: "0.10", note: "for the beacon" },
    });
    await prisma.investmentPledge.create({
      data: { projectId: project.id, userId: thirdId, amountCoin: "0.20" },
    });
    // A withdrawn pledge must count for NOTHING in the aggregates.
    const ghost = await prisma.user.create({
      data: { email: `inv-p-g-${suffix}@w16invest.example` },
    });
    extraUserIds.push(ghost.id);
    await prisma.investmentPledge.create({
      data: { projectId: project.id, userId: ghost.id, amountCoin: "500.00", status: "WITHDRAWN" },
    });

    const asBacker = (await listItems("", backerToken)).find((p) => p.id === project.id)!;
    expect(asBacker.pledgedTotalCoin).toBe("0.30"); // 0.10 + 0.20 exactly — no float drift
    expect(asBacker.pledgeCount).toBe(2);
    expect(asBacker.myPledge).toEqual({
      amountCoin: "0.10",
      note: "for the beacon",
      status: "PLEDGED",
    });
    expect(asBacker.mine).toBe(false);
    expect(asBacker.creatorDisplay).toBe("Applicant");

    const asCreator = (await listItems("", creatorToken)).find((p) => p.id === project.id)!;
    expect(asCreator.mine).toBe(true);
    expect(asCreator.myPledge).toBeNull();

    await prisma.fundraisingProject.delete({ where: { id: project.id } });
  });

  it("marks a SUBMITTED filing community-backed at exactly 7 endorsements", async () => {
    const project = await seedProject({ title: `Backed ${suffix}`, status: "SUBMITTED" });
    for (let i = 0; i < 6; i++) {
      const u = await prisma.user.create({
        data: { email: `inv-p-e${i}-${suffix}@w16invest.example` },
      });
      extraUserIds.push(u.id);
      await prisma.projectEndorsement.create({ data: { projectId: project.id, userId: u.id } });
    }
    let item = (await listItems("?status=SUBMITTED", backerToken)).find(
      (p) => p.id === project.id,
    )!;
    expect(item.endorsementCount).toBe(6);
    expect(item.communityBacked).toBe(false);
    expect(item.myEndorsement).toBe(false);

    await prisma.projectEndorsement.create({ data: { projectId: project.id, userId: backerId } });
    item = (await listItems("?status=SUBMITTED", backerToken)).find((p) => p.id === project.id)!;
    expect(item.endorsementCount).toBe(7);
    expect(item.communityBacked).toBe(true);
    expect(item.myEndorsement).toBe(true);

    await prisma.fundraisingProject.delete({ where: { id: project.id } });
  });

  it("?mine=1 returns the caller's filings in EVERY status and nobody else's", async () => {
    const a = await seedProject({ title: `Mine active ${suffix}` });
    const b = await seedProject({ title: `Mine declined ${suffix}`, status: "DECLINED" });
    const c = await seedProject({ title: `Mine withdrawn ${suffix}`, status: "WITHDRAWN" });
    const theirs = await seedProject({ title: `Theirs ${suffix}`, creatorUserId: backerId });

    const items = await listItems("?mine=1", creatorToken);
    expect(items.map((p) => p.id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(new Set(items.map((p) => p.status))).toEqual(
      new Set(["ACTIVE", "DECLINED", "WITHDRAWN"]),
    );
    expect(items.every((p) => p.mine)).toBe(true);

    await prisma.fundraisingProject.deleteMany({
      where: { id: { in: [a.id, b.id, c.id, theirs.id] } },
    });
  });

  it("shows 'Citizen № N' for a sealed creator (cached tokenId, no chain call)", async () => {
    const project = await seedProject({ title: `Sealed creator ${suffix}` });
    await prisma.citizenshipApplication.create({
      data: { userId: creatorId, status: "MINTED", citizenTokenId: "77" },
    });
    const item = (await listItems("", backerToken)).find((p) => p.id === project.id)!;
    expect(item.creatorDisplay).toBe("Citizen № 77");
    await prisma.citizenshipApplication.deleteMany({ where: { userId: creatorId } });
    await prisma.fundraisingProject.delete({ where: { id: project.id } });
  });
});

describe("POST /api/invest/projects", () => {
  it("403 on a foreign origin and 401 without a session", async () => {
    expect(
      (await POST(postReq(validBody(), { token: creatorToken, origin: "https://evil.example" })))
        .status,
    ).toBe(403);
    expect((await POST(postReq(validBody()))).status).toBe(401);
  });

  it("400 on malformed JSON, unknown keys, and zod bounds", async () => {
    const bad = new Request(`${APP}/api/invest/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP,
        cookie: `cr_session=${creatorToken}`,
      },
      body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);

    for (const overrides of [
      { extra: 1 },
      { title: "abc" },
      { title: "x".repeat(81) },
      { summary: "too short" },
      { summary: "x".repeat(281) },
      { description: "way too short for a filing" },
      { category: "WEAPONS" },
      { goalCoin: "0" },
      { goalCoin: "1.234" },
      { goalCoin: "10000000.01" },
      { goalCoin: "" },
      { treasuryAddress: "not-an-address" },
      { treasuryAddress: "0x1234" },
    ]) {
      const res = await POST(postReq(validBody(overrides), { token: creatorToken }));
      expect(res.status, JSON.stringify(overrides)).toBe(400);
    }
  });

  it("400 when the treasury address fails its viem checksum", async () => {
    // valid hex shape, but all-lowercase ≠ its checksummed form
    const lower = CHECKSUMMED.toLowerCase();
    const res = await POST(postReq(validBody({ treasuryAddress: lower }), { token: creatorToken }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/checksum/i);

    // right shape, wrong capitalisation pattern → viem getAddress throws
    const mangled = CHECKSUMMED.replace("0x8ba", "0x8bA");
    expect(
      (await POST(postReq(validBody({ treasuryAddress: mangled }), { token: creatorToken })))
        .status,
    ).toBe(400);
  });

  it("happy path: SUBMITTED start, verbatim goalCoin, checksummed treasury stored", async () => {
    const res = await POST(
      postReq(validBody({ goalCoin: "9.5", treasuryAddress: CHECKSUMMED }), {
        token: creatorToken,
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      project: { id: string; status: string; goalCoin: string; treasuryAddress: string };
    };
    expect(data.ok).toBe(true);
    expect(data.project.status).toBe("SUBMITTED");
    expect(data.project.goalCoin).toBe("9.5"); // stored as given, never a float
    expect(data.project.treasuryAddress).toBe(CHECKSUMMED);

    const row = await prisma.fundraisingProject.findUnique({ where: { id: data.project.id } });
    expect(row?.goalCoin).toBe("9.5");
    expect(row?.creatorUserId).toBe(creatorId);
    await prisma.fundraisingProject.delete({ where: { id: data.project.id } });
  });

  it("caps a citizen at 1 open fundraiser (SUBMITTED|ACTIVE); terminal filings free the slot", async () => {
    const open = await seedProject({ title: `Cap holder ${suffix}`, status: "SUBMITTED" });
    const refused = await POST(postReq(validBody(), { token: creatorToken }));
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toMatch(/open fundraiser/i);

    // ACTIVE also occupies the slot.
    await prisma.fundraisingProject.update({ where: { id: open.id }, data: { status: "ACTIVE" } });
    expect((await POST(postReq(validBody(), { token: creatorToken }))).status).toBe(400);

    // A terminal status frees it.
    await prisma.fundraisingProject.update({
      where: { id: open.id },
      data: { status: "WITHDRAWN" },
    });
    const accepted = await POST(postReq(validBody(), { token: creatorToken }));
    expect(accepted.status).toBe(200);
    const created = (await accepted.json()) as { project: { id: string } };
    await prisma.fundraisingProject.deleteMany({
      where: { id: { in: [open.id, created.project.id] } },
    });
  });
});
