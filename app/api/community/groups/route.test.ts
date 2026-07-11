// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { getOrAssignCivicId } from "@/lib/identity/civicId";
import { POST } from "./route";

/**
 * /api/community/groups (Wave 17 — create). Real prisma. Asserts: every
 * memberCivicId must be an ACCEPTED connection of the creator, with the 400
 * LISTING the ids that are not (unknown ids land in the same list — no
 * existence oracle); the happy path creates the GROUP with creator + all
 * members; duplicates dedupe.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const creatorEmail = `com-gr-c-${suffix}@w17community.example`;
const f1Email = `com-gr-1-${suffix}@w17community.example`;
const f2Email = `com-gr-2-${suffix}@w17community.example`;
const strangerEmail = `com-gr-s-${suffix}@w17community.example`;
const UNKNOWN_CIVIC_ID = "CR-TSTS-TSTS";

let creatorId: string;
let f1Id: string;
let f2Id: string;
let strangerId: string;
let creatorToken: string;
let f1CivicId: string;
let f2CivicId: string;
let strangerCivicId: string;
const allIds = () => [creatorId, f1Id, f2Id, strangerId];

function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/community/groups`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const [c, a, b, s] = await Promise.all([
    prisma.user.create({ data: { email: creatorEmail } }),
    prisma.user.create({ data: { email: f1Email } }),
    prisma.user.create({ data: { email: f2Email } }),
    prisma.user.create({ data: { email: strangerEmail } }),
  ]);
  creatorId = c.id;
  f1Id = a.id;
  f2Id = b.id;
  strangerId = s.id;
  [f1CivicId, f2CivicId, strangerCivicId] = await Promise.all([
    getOrAssignCivicId(f1Id),
    getOrAssignCivicId(f2Id),
    getOrAssignCivicId(strangerId),
  ]);
  ({ token: creatorToken } = await createSession(creatorId));
  // f1 and f2 are ACCEPTED connections of the creator (one each direction);
  // the stranger's request is merely PENDING — that is NOT enough.
  await prisma.citizenConnection.createMany({
    data: [
      {
        requesterUserId: creatorId,
        addresseeUserId: f1Id,
        kind: "FRIEND",
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
      {
        requesterUserId: f2Id,
        addresseeUserId: creatorId,
        kind: "FAMILY",
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
      {
        requesterUserId: strangerId,
        addresseeUserId: creatorId,
        kind: "FRIEND",
        status: "PENDING",
      },
    ],
  });
});

async function cleanupConversations() {
  const convos = await prisma.conversation.findMany({
    where: { members: { some: { userId: { in: allIds() } } } },
    select: { id: true },
  });
  await prisma.conversation.deleteMany({ where: { id: { in: convos.map((c) => c.id) } } });
}

beforeEach(cleanupConversations);

afterAll(async () => {
  await cleanupConversations();
  await prisma.citizenConnection.deleteMany({
    where: {
      OR: [{ requesterUserId: { in: allIds() } }, { addresseeUserId: { in: allIds() } }],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: allIds() } } });
  await prisma.$disconnect();
});

describe("POST /api/community/groups", () => {
  it("403 foreign origin, 401 no session, 400 zod bounds", async () => {
    const valid = { title: "The Council", memberCivicIds: [f1CivicId] };
    expect(
      (await POST(postReq(valid, { token: creatorToken, origin: "https://evil.example" }))).status,
    ).toBe(403);
    expect((await POST(postReq(valid))).status).toBe(401);
    expect(
      (await POST(postReq({ title: "x", memberCivicIds: [f1CivicId] }, { token: creatorToken })))
        .status,
    ).toBe(400);
    expect(
      (await POST(postReq({ title: "The Council", memberCivicIds: [] }, { token: creatorToken })))
        .status,
    ).toBe(400);
    expect(
      (
        await POST(
          postReq(
            { title: "The Council", memberCivicIds: ["not-a-civic-id"] },
            { token: creatorToken },
          ),
        )
      ).status,
    ).toBe(400);
    expect((await POST(postReq({ ...valid, x: 1 }, { token: creatorToken }))).status).toBe(400);
  });

  it("400 LISTING every Civic ID that is not an accepted connection (unknown ids included)", async () => {
    const res = await POST(
      postReq(
        {
          title: "Mixed company",
          memberCivicIds: [f1CivicId, strangerCivicId, UNKNOWN_CIVIC_ID],
        },
        { token: creatorToken },
      ),
    );
    expect(res.status).toBe(400);
    const { error } = (await res.json()) as { error: string };
    expect(error).toContain(strangerCivicId); // pending ≠ accepted
    expect(error).toContain(UNKNOWN_CIVIC_ID); // unknown answers identically
    expect(error).not.toContain(f1CivicId); // the valid member is NOT blamed
    expect(await prisma.conversation.count({ where: { creatorUserId: creatorId } })).toBe(0);
  });

  it("creates the GROUP with creator + all members (duplicates deduped)", async () => {
    const res = await POST(
      postReq(
        {
          title: `  The Council ${suffix}  `,
          memberCivicIds: [f1CivicId, f2CivicId, f1CivicId],
        },
        { token: creatorToken },
      ),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      conversation: { conversationId: string; kind: string; title: string };
    };
    expect(data.conversation.kind).toBe("GROUP");
    expect(data.conversation.title).toBe(`The Council ${suffix}`); // trimmed

    const members = await prisma.conversationMember.findMany({
      where: { conversationId: data.conversation.conversationId },
    });
    expect(members).toHaveLength(3); // creator + f1 + f2, f1 only once
    expect(new Set(members.map((m) => m.userId))).toEqual(new Set([creatorId, f1Id, f2Id]));
    const f1Member = members.find((m) => m.userId === f1Id);
    expect(f1Member?.addedBy).toBe(creatorId);
    const convo = await prisma.conversation.findUnique({
      where: { id: data.conversation.conversationId },
    });
    expect(convo?.creatorUserId).toBe(creatorId);
  });
});
