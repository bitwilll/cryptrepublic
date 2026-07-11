// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { getOrAssignCivicId } from "@/lib/identity/civicId";
import { POST } from "./route";

/**
 * /api/community/groups/add (Wave 17). Real prisma. Asserts: creator-only
 * (403 for a mere member), the ACCEPTED-connection rule (400 — same answer
 * for unknown ids), idempotent re-add (an existing member stays single-row;
 * a LEFT member is reactivated with leftAt cleared).
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const creatorEmail = `com-ga-c-${suffix}@w17community.example`;
const m1Email = `com-ga-1-${suffix}@w17community.example`;
const m2Email = `com-ga-2-${suffix}@w17community.example`;
const strangerEmail = `com-ga-s-${suffix}@w17community.example`;

let creatorId: string;
let m1Id: string;
let m2Id: string;
let strangerId: string;
let creatorToken: string;
let m1Token: string;
let m2CivicId: string;
let strangerCivicId: string;
let groupId: string;
const allIds = () => [creatorId, m1Id, m2Id, strangerId];

function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/community/groups/add`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const [c, a, b, s] = await Promise.all([
    prisma.user.create({ data: { email: creatorEmail } }),
    prisma.user.create({ data: { email: m1Email } }),
    prisma.user.create({ data: { email: m2Email } }),
    prisma.user.create({ data: { email: strangerEmail } }),
  ]);
  creatorId = c.id;
  m1Id = a.id;
  m2Id = b.id;
  strangerId = s.id;
  [m2CivicId, strangerCivicId] = await Promise.all([
    getOrAssignCivicId(m2Id),
    getOrAssignCivicId(strangerId),
  ]);
  [{ token: creatorToken }, { token: m1Token }] = await Promise.all([
    createSession(creatorId),
    createSession(m1Id),
  ]);
  // m1 and m2 are ACCEPTED connections of the creator; the stranger is not.
  await prisma.citizenConnection.createMany({
    data: [
      {
        requesterUserId: creatorId,
        addresseeUserId: m1Id,
        kind: "FRIEND",
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
      {
        requesterUserId: m2Id,
        addresseeUserId: creatorId,
        kind: "FRIEND",
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
    ],
  });
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
      title: `Chamber ${suffix}`,
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
  await prisma.citizenConnection.deleteMany({
    where: {
      OR: [{ requesterUserId: { in: allIds() } }, { addresseeUserId: { in: allIds() } }],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: allIds() } } });
  await prisma.$disconnect();
});

describe("POST /api/community/groups/add", () => {
  it("gates: origin 403, auth 401, unknown group 400, DIRECT 400, non-creator 403", async () => {
    const valid = { conversationId: groupId, civicId: m2CivicId };
    expect(
      (await POST(postReq(valid, { token: creatorToken, origin: "https://evil.example" }))).status,
    ).toBe(403);
    expect((await POST(postReq(valid))).status).toBe(401);
    expect(
      (
        await POST(
          postReq({ conversationId: "no-such-group", civicId: m2CivicId }, { token: creatorToken }),
        )
      ).status,
    ).toBe(400);

    const direct = await prisma.conversation.create({
      data: { kind: "DIRECT", members: { create: [{ userId: creatorId }, { userId: m1Id }] } },
    });
    expect(
      (
        await POST(
          postReq({ conversationId: direct.id, civicId: m2CivicId }, { token: creatorToken }),
        )
      ).status,
    ).toBe(400);

    // m1 is a member but NOT the creator.
    expect((await POST(postReq(valid, { token: m1Token }))).status).toBe(403);
  });

  it("400 when the Civic ID is not an ACCEPTED connection of the creator", async () => {
    const res = await POST(
      postReq({ conversationId: groupId, civicId: strangerCivicId }, { token: creatorToken }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain(strangerCivicId);
    expect(
      await prisma.conversationMember.count({
        where: { conversationId: groupId, userId: strangerId },
      }),
    ).toBe(0);
  });

  it("adds an accepted connection; re-adding is idempotent; a LEFT member is reactivated", async () => {
    const valid = { conversationId: groupId, civicId: m2CivicId };
    expect((await POST(postReq(valid, { token: creatorToken }))).status).toBe(200);
    const member = await prisma.conversationMember.findFirst({
      where: { conversationId: groupId, userId: m2Id },
    });
    expect(member).not.toBeNull();
    expect(member?.addedBy).toBe(creatorId);
    expect(member?.leftAt).toBeNull();

    // idempotent re-add — still exactly one row
    expect((await POST(postReq(valid, { token: creatorToken }))).status).toBe(200);
    expect(
      await prisma.conversationMember.count({ where: { conversationId: groupId, userId: m2Id } }),
    ).toBe(1);

    // leave, then re-add → reactivated (leftAt cleared), same single row
    await prisma.conversationMember.update({
      where: { id: member!.id },
      data: { leftAt: new Date() },
    });
    expect((await POST(postReq(valid, { token: creatorToken }))).status).toBe(200);
    const reactivated = await prisma.conversationMember.findUnique({ where: { id: member!.id } });
    expect(reactivated?.leftAt).toBeNull();
    expect(
      await prisma.conversationMember.count({ where: { conversationId: groupId, userId: m2Id } }),
    ).toBe(1);
  });
});
