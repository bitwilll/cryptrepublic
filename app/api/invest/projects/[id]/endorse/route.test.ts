// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST, DELETE } from "./route";

/**
 * /api/invest/projects/[id]/endorse (Wave 16 invest). The community signal:
 * origin + auth gates on BOTH verbs, 404 unknown, 400 own filing, 400
 * non-SUBMITTED, one endorsement per citizen (repeat POST idempotent — the
 * @@unique holds), DELETE removes, and the community-backed flag flips at 7.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let creatorId: string;
let endorserId: string;
let creatorToken: string;
let endorserToken: string;
let projectId: string;
const extraUserIds: string[] = [];

function req(
  id: string,
  method: "POST" | "DELETE",
  opts: { token?: string; origin?: string } = {},
) {
  const headers: Record<string, string> = {};
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/invest/projects/${id}/endorse`, { method, headers });
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}
async function seed(status = "SUBMITTED") {
  return prisma.fundraisingProject.create({
    data: {
      creatorUserId: creatorId,
      title: `Endorsable ${suffix}`,
      summary: "Summary for the endorse route suite.",
      description: "Description for the endorse route suite, long enough to pass zod.",
      category: "WELFARE",
      goalCoin: "75.00",
      status,
    },
  });
}

beforeAll(async () => {
  const [creator, endorser] = await Promise.all([
    prisma.user.create({ data: { email: `inv-e-c-${suffix}@w16invest.example` } }),
    prisma.user.create({ data: { email: `inv-e-e-${suffix}@w16invest.example` } }),
  ]);
  creatorId = creator.id;
  endorserId = endorser.id;
  ({ token: creatorToken } = await createSession(creatorId));
  ({ token: endorserToken } = await createSession(endorserId));
  projectId = (await seed()).id;
});

afterAll(async () => {
  await prisma.fundraisingProject.deleteMany({ where: { creatorUserId: creatorId } });
  await prisma.user.deleteMany({
    where: { id: { in: [creatorId, endorserId, ...extraUserIds] } },
  });
  await prisma.$disconnect();
});

describe("guards (both verbs)", () => {
  it("403 foreign origin, 401 no session, 404 unknown project", async () => {
    for (const method of ["POST", "DELETE"] as const) {
      const handler = method === "POST" ? POST : DELETE;
      expect(
        (
          await handler(
            req(projectId, method, { token: endorserToken, origin: "https://evil.example" }),
            params(projectId),
          )
        ).status,
        `${method} origin`,
      ).toBe(403);
      expect(
        (await handler(req(projectId, method), params(projectId))).status,
        `${method} auth`,
      ).toBe(401);
      expect(
        (await handler(req("nope", method, { token: endorserToken }), params("nope"))).status,
        `${method} 404`,
      ).toBe(404);
    }
  });

  it("400 on your own filing and on any non-SUBMITTED project", async () => {
    expect(
      (await POST(req(projectId, "POST", { token: creatorToken }), params(projectId))).status,
    ).toBe(400);

    const active = await seed("ACTIVE");
    expect(
      (await POST(req(active.id, "POST", { token: endorserToken }), params(active.id))).status,
    ).toBe(400);
    expect(
      (await DELETE(req(active.id, "DELETE", { token: endorserToken }), params(active.id))).status,
    ).toBe(400);
    await prisma.fundraisingProject.delete({ where: { id: active.id } });
  });
});

describe("POST /endorse then DELETE /endorse", () => {
  it("endorses once per citizen — a repeat POST is idempotent, DELETE removes", async () => {
    const first = await POST(req(projectId, "POST", { token: endorserToken }), params(projectId));
    expect(first.status).toBe(200);
    const d1 = (await first.json()) as {
      ok: boolean;
      endorsed: boolean;
      endorsementCount: number;
      communityBacked: boolean;
    };
    expect(d1).toEqual({ ok: true, endorsed: true, endorsementCount: 1, communityBacked: false });

    const repeat = await POST(req(projectId, "POST", { token: endorserToken }), params(projectId));
    expect(repeat.status).toBe(200);
    expect(((await repeat.json()) as { endorsementCount: number }).endorsementCount).toBe(1);
    expect(
      await prisma.projectEndorsement.count({ where: { projectId, userId: endorserId } }),
    ).toBe(1);

    const removed = await DELETE(
      req(projectId, "DELETE", { token: endorserToken }),
      params(projectId),
    );
    expect(removed.status).toBe(200);
    const d2 = (await removed.json()) as { endorsed: boolean; endorsementCount: number };
    expect(d2.endorsed).toBe(false);
    expect(d2.endorsementCount).toBe(0);
    expect(await prisma.projectEndorsement.count({ where: { projectId } })).toBe(0);
  });

  it("flips communityBacked at the 7th endorsement (witness-rule echo)", async () => {
    for (let i = 0; i < 6; i++) {
      const u = await prisma.user.create({
        data: { email: `inv-e-x${i}-${suffix}@w16invest.example` },
      });
      extraUserIds.push(u.id);
      await prisma.projectEndorsement.create({ data: { projectId, userId: u.id } });
    }
    const seventh = await POST(req(projectId, "POST", { token: endorserToken }), params(projectId));
    const data = (await seventh.json()) as { endorsementCount: number; communityBacked: boolean };
    expect(data.endorsementCount).toBe(7);
    expect(data.communityBacked).toBe(true);
  });
});
