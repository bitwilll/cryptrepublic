// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

/**
 * /api/invest/pledges/withdraw (Wave 16 invest). Origin/auth gates, zod 400,
 * 404 when there is NO standing pledge (never pledged, someone else's pledge,
 * or already withdrawn), and the happy flip PLEDGED → WITHDRAWN keeping the
 * row for a later re-pledge.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let creatorId: string;
let backerId: string;
let strangerId: string;
let backerToken: string;
let strangerToken: string;
let projectId: string;

function req(body: unknown, opts: { token?: string; origin?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/invest/pledges/withdraw`, {
    method: "POST",
    headers,
    body: opts.raw ?? JSON.stringify(body),
  });
}

beforeAll(async () => {
  const [creator, backer, stranger] = await Promise.all([
    prisma.user.create({ data: { email: `inv-pw-c-${suffix}@w16invest.example` } }),
    prisma.user.create({ data: { email: `inv-pw-b-${suffix}@w16invest.example` } }),
    prisma.user.create({ data: { email: `inv-pw-s-${suffix}@w16invest.example` } }),
  ]);
  creatorId = creator.id;
  backerId = backer.id;
  strangerId = stranger.id;
  ({ token: backerToken } = await createSession(backerId));
  ({ token: strangerToken } = await createSession(strangerId));

  projectId = (
    await prisma.fundraisingProject.create({
      data: {
        creatorUserId: creatorId,
        title: `Pledge-withdraw project ${suffix}`,
        summary: "Summary for the pledge-withdraw suite.",
        description: "Description for the pledge-withdraw suite, long enough to pass zod.",
        category: "OTHER",
        goalCoin: "300.00",
        status: "ACTIVE",
      },
    })
  ).id;
  await prisma.investmentPledge.create({
    data: { projectId, userId: backerId, amountCoin: "42.00" },
  });
});

afterAll(async () => {
  await prisma.fundraisingProject.deleteMany({ where: { creatorUserId: creatorId } });
  await prisma.user.deleteMany({ where: { id: { in: [creatorId, backerId, strangerId] } } });
  await prisma.$disconnect();
});

describe("POST /api/invest/pledges/withdraw", () => {
  it("403 foreign origin, 401 no session, 400 bad body", async () => {
    expect(
      (await POST(req({ projectId }, { token: backerToken, origin: "https://evil.example" })))
        .status,
    ).toBe(403);
    expect((await POST(req({ projectId }))).status).toBe(401);
    expect((await POST(req(null, { token: backerToken, raw: "{not json" }))).status).toBe(400);
    expect((await POST(req({}, { token: backerToken }))).status).toBe(400);
    expect((await POST(req({ projectId, extra: 1 }, { token: backerToken }))).status).toBe(400);
  });

  it("404 when the caller holds no standing pledge — including someone else's", async () => {
    // stranger never pledged; the backer's pledge must be invisible to them.
    expect((await POST(req({ projectId }, { token: strangerToken }))).status).toBe(404);
    const untouched = await prisma.investmentPledge.findUnique({
      where: { projectId_userId: { projectId, userId: backerId } },
    });
    expect(untouched?.status).toBe("PLEDGED");
  });

  it("flips the caller's pledge to WITHDRAWN, keeps the row, then 404s a repeat", async () => {
    const res = await POST(req({ projectId }, { token: backerToken }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; pledge: { status: string } };
    expect(data.ok).toBe(true);
    expect(data.pledge.status).toBe("WITHDRAWN");

    const row = await prisma.investmentPledge.findUnique({
      where: { projectId_userId: { projectId, userId: backerId } },
    });
    expect(row?.status).toBe("WITHDRAWN"); // row survives for a later re-pledge
    expect(row?.amountCoin).toBe("42.00");

    expect((await POST(req({ projectId }, { token: backerToken }))).status).toBe(404);
  });
});
