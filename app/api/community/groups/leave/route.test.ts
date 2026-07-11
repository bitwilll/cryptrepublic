// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

/**
 * /api/community/groups/leave (Wave 17). Real prisma. Asserts: the strict
 * one-key schema, member-only 403 (incl. already-left), GROUP-only (DIRECT
 * refuses 400), and that the CREATOR leaving does NOT delete the group —
 * the remaining members keep their memberships.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const creatorEmail = `com-gl-c-${suffix}@w17community.example`;
const m1Email = `com-gl-1-${suffix}@w17community.example`;
const outsiderEmail = `com-gl-o-${suffix}@w17community.example`;

let creatorId: string;
let m1Id: string;
let outsiderId: string;
let creatorToken: string;
let m1Token: string;
let outsiderToken: string;
let groupId: string;
const allIds = () => [creatorId, m1Id, outsiderId];

function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/community/groups/leave`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const [c, a, o] = await Promise.all([
    prisma.user.create({ data: { email: creatorEmail } }),
    prisma.user.create({ data: { email: m1Email } }),
    prisma.user.create({ data: { email: outsiderEmail } }),
  ]);
  creatorId = c.id;
  m1Id = a.id;
  outsiderId = o.id;
  [{ token: creatorToken }, { token: m1Token }, { token: outsiderToken }] = await Promise.all([
    createSession(creatorId),
    createSession(m1Id),
    createSession(outsiderId),
  ]);
});

beforeEach(async () => {
  const convos = await prisma.conversation.findMany({
    where: { members: { some: { userId: { in: allIds() } } } },
    select: { id: true },
  });
  await prisma.conversation.deleteMany({ where: { id: { in: convos.map((c) => c.id) } } });
  const group = await prisma.conversation.create({
    data: {
      kind: "GROUP",
      title: `Round table ${suffix}`,
      creatorUserId: creatorId,
      members: { create: [{ userId: creatorId }, { userId: m1Id, addedBy: creatorId }] },
    },
  });
  groupId = group.id;
});

afterAll(async () => {
  const convos = await prisma.conversation.findMany({
    where: { members: { some: { userId: { in: allIds() } } } },
    select: { id: true },
  });
  await prisma.conversation.deleteMany({ where: { id: { in: convos.map((c) => c.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: allIds() } } });
  await prisma.$disconnect();
});

describe("POST /api/community/groups/leave", () => {
  it("gates: origin 403, auth 401, strict schema 400, non-member 403, DIRECT 400", async () => {
    expect(
      (
        await POST(
          postReq({ conversationId: groupId }, { token: m1Token, origin: "https://evil.example" }),
        )
      ).status,
    ).toBe(403);
    expect((await POST(postReq({ conversationId: groupId }))).status).toBe(401);
    expect(
      (await POST(postReq({ conversationId: groupId, force: true }, { token: m1Token }))).status,
    ).toBe(400); // .strict() — unknown keys refused
    expect(
      (await POST(postReq({ conversationId: groupId }, { token: outsiderToken }))).status,
    ).toBe(403);

    const direct = await prisma.conversation.create({
      data: { kind: "DIRECT", members: { create: [{ userId: creatorId }, { userId: m1Id }] } },
    });
    expect((await POST(postReq({ conversationId: direct.id }, { token: m1Token }))).status).toBe(
      400,
    );
  });

  it("sets MY leftAt only; leaving twice is refused", async () => {
    const res = await POST(postReq({ conversationId: groupId }, { token: m1Token }));
    expect(res.status).toBe(200);
    const mine = await prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId: m1Id },
    });
    expect(mine?.leftAt).not.toBeNull();
    const creators = await prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId: creatorId },
    });
    expect(creators?.leftAt).toBeNull();

    // already left → no active membership → 403
    expect((await POST(postReq({ conversationId: groupId }, { token: m1Token }))).status).toBe(403);
  });

  it("the CREATOR leaving does NOT delete the group", async () => {
    const res = await POST(postReq({ conversationId: groupId }, { token: creatorToken }));
    expect(res.status).toBe(200);
    const convo = await prisma.conversation.findUnique({ where: { id: groupId } });
    expect(convo).not.toBeNull(); // the group survives its creator
    const remaining = await prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId: m1Id },
    });
    expect(remaining?.leftAt).toBeNull(); // the members keep talking
  });
});
