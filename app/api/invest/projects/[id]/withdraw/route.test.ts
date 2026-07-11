// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

/**
 * /api/invest/projects/[id]/withdraw (Wave 16 invest). The creator's exit:
 * origin 403 / auth 401 / 404 unknown / 403 non-creator / 400 on any
 * transition except SUBMITTED|ACTIVE → WITHDRAWN.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let creatorId: string;
let strangerId: string;
let creatorToken: string;
let strangerToken: string;

function req(id: string, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/invest/projects/${id}/withdraw`, {
    method: "POST",
    headers,
    body: "{}",
  });
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
async function seed(status: string) {
  return prisma.fundraisingProject.create({
    data: {
      creatorUserId: creatorId,
      title: `Withdrawable ${status} ${suffix}`,
      summary: "Summary for the withdraw route suite.",
      description: "Description for the withdraw route suite, long enough to pass zod.",
      category: "CULTURE",
      goalCoin: "50.00",
      status,
    },
  });
}

beforeAll(async () => {
  const [creator, stranger] = await Promise.all([
    prisma.user.create({ data: { email: `inv-w-c-${suffix}@w16invest.example` } }),
    prisma.user.create({ data: { email: `inv-w-s-${suffix}@w16invest.example` } }),
  ]);
  creatorId = creator.id;
  strangerId = stranger.id;
  ({ token: creatorToken } = await createSession(creatorId));
  ({ token: strangerToken } = await createSession(strangerId));
});

afterAll(async () => {
  await prisma.fundraisingProject.deleteMany({ where: { creatorUserId: creatorId } });
  await prisma.user.deleteMany({ where: { id: { in: [creatorId, strangerId] } } });
  await prisma.$disconnect();
});

describe("POST /api/invest/projects/[id]/withdraw", () => {
  it("403 foreign origin, 401 no session, 404 unknown project", async () => {
    const p = await seed("ACTIVE");
    expect(
      (await POST(req(p.id, { token: creatorToken, origin: "https://evil.example" }), params(p.id)))
        .status,
    ).toBe(403);
    expect((await POST(req(p.id), params(p.id))).status).toBe(401);
    expect((await POST(req("nope", { token: creatorToken }), params("nope"))).status).toBe(404);
    await prisma.fundraisingProject.delete({ where: { id: p.id } });
  });

  it("403 for anyone but the creator — the filing stays untouched", async () => {
    const p = await seed("ACTIVE");
    expect((await POST(req(p.id, { token: strangerToken }), params(p.id))).status).toBe(403);
    const row = await prisma.fundraisingProject.findUnique({ where: { id: p.id } });
    expect(row?.status).toBe("ACTIVE");
    await prisma.fundraisingProject.delete({ where: { id: p.id } });
  });

  it("withdraws from SUBMITTED and from ACTIVE", async () => {
    for (const status of ["SUBMITTED", "ACTIVE"]) {
      const p = await seed(status);
      const res = await POST(req(p.id, { token: creatorToken }), params(p.id));
      expect(res.status, status).toBe(200);
      const data = (await res.json()) as { ok: boolean; project: { status: string } };
      expect(data.ok).toBe(true);
      expect(data.project.status).toBe("WITHDRAWN");
      const row = await prisma.fundraisingProject.findUnique({ where: { id: p.id } });
      expect(row?.status).toBe("WITHDRAWN");
      await prisma.fundraisingProject.delete({ where: { id: p.id } });
    }
  });

  it("400 on every terminal state — decisions and withdrawals are final", async () => {
    for (const status of ["DECLINED", "CLOSED", "WITHDRAWN"]) {
      const p = await seed(status);
      const res = await POST(req(p.id, { token: creatorToken }), params(p.id));
      expect(res.status, status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(new RegExp(status));
      await prisma.fundraisingProject.delete({ where: { id: p.id } });
    }
  });
});
