// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET, POST } from "./route";

/**
 * /api/invest/pledges (Wave 16 invest). POST: origin/auth gates, zod 400s,
 * 404 unknown project, 400 own project, 400 non-ACTIVE, verbatim amount
 * storage, and the (projectId,userId) upsert — amend updates IN PLACE and a
 * WITHDRAWN pledge flips back to PLEDGED, always one row. GET: the caller's
 * own ledger only, with project context.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let creatorId: string;
let backerId: string;
let backerToken: string;
let creatorToken: string;
let activeId: string;
let submittedId: string;

function getReq(token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `cr_session=${token}`;
  return new Request(`${APP}/api/invest/pledges`, { headers });
}
function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/invest/pledges`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const [creator, backer] = await Promise.all([
    prisma.user.create({ data: { email: `inv-pl-c-${suffix}@w16invest.example` } }),
    prisma.user.create({ data: { email: `inv-pl-b-${suffix}@w16invest.example` } }),
  ]);
  creatorId = creator.id;
  backerId = backer.id;
  ({ token: backerToken } = await createSession(backerId));
  ({ token: creatorToken } = await createSession(creatorId));

  const base = {
    creatorUserId: creatorId,
    summary: "Summary for the pledges route suite.",
    description: "Description for the pledges route suite, long enough to pass zod.",
    category: "TECHNOLOGY",
    goalCoin: "500.00",
  };
  activeId = (
    await prisma.fundraisingProject.create({
      data: { ...base, title: `Pledgeable active ${suffix}`, status: "ACTIVE" },
    })
  ).id;
  submittedId = (
    await prisma.fundraisingProject.create({
      data: { ...base, title: `Pledgeable submitted ${suffix}`, status: "SUBMITTED" },
    })
  ).id;
});

afterAll(async () => {
  await prisma.fundraisingProject.deleteMany({ where: { creatorUserId: creatorId } });
  await prisma.user.deleteMany({ where: { id: { in: [creatorId, backerId] } } });
  await prisma.$disconnect();
});

describe("POST /api/invest/pledges", () => {
  it("403 foreign origin, 401 no session", async () => {
    const body = { projectId: activeId, amountCoin: "10.00" };
    expect(
      (await POST(postReq(body, { token: backerToken, origin: "https://evil.example" }))).status,
    ).toBe(403);
    expect((await POST(postReq(body))).status).toBe(401);
  });

  it("400 on malformed JSON and zod violations", async () => {
    const bad = new Request(`${APP}/api/invest/pledges`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP,
        cookie: `cr_session=${backerToken}`,
      },
      body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);

    for (const body of [
      { projectId: activeId, amountCoin: "0" },
      { projectId: activeId, amountCoin: "1.234" },
      { projectId: activeId, amountCoin: "10000000.01" },
      { projectId: activeId, amountCoin: "" },
      { projectId: activeId, amountCoin: "10.00", note: "x".repeat(281) },
      { projectId: activeId, amountCoin: "10.00", extra: 1 },
      { projectId: "", amountCoin: "10.00" },
      { amountCoin: "10.00" },
    ]) {
      expect((await POST(postReq(body, { token: backerToken }))).status, JSON.stringify(body)).toBe(
        400,
      );
    }
  });

  it("404 unknown project, 400 own project, 400 non-ACTIVE project", async () => {
    expect(
      (await POST(postReq({ projectId: "nope", amountCoin: "10.00" }, { token: backerToken })))
        .status,
    ).toBe(404);
    expect(
      (await POST(postReq({ projectId: activeId, amountCoin: "10.00" }, { token: creatorToken })))
        .status,
    ).toBe(400);
    const res = await POST(
      postReq({ projectId: submittedId, amountCoin: "10.00" }, { token: backerToken }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/active/i);
  });

  it("creates PLEDGED with the amount stored VERBATIM, then amends the SAME row", async () => {
    const created = await POST(
      postReq({ projectId: activeId, amountCoin: "9.5", note: "first" }, { token: backerToken }),
    );
    expect(created.status).toBe(200);
    const d1 = (await created.json()) as {
      ok: boolean;
      pledge: { amountCoin: string; note: string | null; status: string };
    };
    expect(d1.pledge).toMatchObject({ amountCoin: "9.5", note: "first", status: "PLEDGED" });

    const amended = await POST(
      postReq({ projectId: activeId, amountCoin: "20.00" }, { token: backerToken }),
    );
    expect(amended.status).toBe(200);
    const d2 = (await amended.json()) as { pledge: { amountCoin: string; note: string | null } };
    expect(d2.pledge.amountCoin).toBe("20.00");
    expect(d2.pledge.note).toBeNull(); // amend without a note clears it

    const rows = await prisma.investmentPledge.findMany({
      where: { projectId: activeId, userId: backerId },
    });
    expect(rows).toHaveLength(1); // @@unique(projectId,userId) — upsert, never a second row
    expect(rows[0]!.amountCoin).toBe("20.00");
  });

  it("re-pledging flips a WITHDRAWN pledge back to PLEDGED", async () => {
    await prisma.investmentPledge.update({
      where: { projectId_userId: { projectId: activeId, userId: backerId } },
      data: { status: "WITHDRAWN" },
    });
    const res = await POST(
      postReq({ projectId: activeId, amountCoin: "15.00" }, { token: backerToken }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { pledge: { status: string } }).pledge.status).toBe("PLEDGED");
    const row = await prisma.investmentPledge.findUnique({
      where: { projectId_userId: { projectId: activeId, userId: backerId } },
    });
    expect(row?.status).toBe("PLEDGED");
    expect(row?.amountCoin).toBe("15.00");
  });
});

describe("GET /api/invest/pledges", () => {
  it("401 without a session", async () => {
    expect((await GET(getReq())).status).toBe(401);
  });

  it("returns ONLY the caller's ledger with project context", async () => {
    // creator pledges to nothing; backer holds exactly the pledge from above.
    const asBacker = await GET(getReq(backerToken));
    expect(asBacker.status).toBe(200);
    const mine = (await asBacker.json()) as {
      pledges: Array<{
        projectId: string;
        projectTitle: string;
        projectStatus: string;
        amountCoin: string;
        status: string;
      }>;
    };
    expect(mine.pledges).toHaveLength(1);
    expect(mine.pledges[0]).toMatchObject({
      projectId: activeId,
      projectTitle: `Pledgeable active ${suffix}`,
      projectStatus: "ACTIVE",
      amountCoin: "15.00",
      status: "PLEDGED",
    });

    const asCreator = await GET(getReq(creatorToken));
    expect(((await asCreator.json()) as { pledges: unknown[] }).pledges).toHaveLength(0);
  });
});
