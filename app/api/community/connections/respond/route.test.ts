// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

/**
 * /api/community/connections/respond (Wave 17). Real prisma. Asserts:
 * accept is addressee-only + PENDING-only and creates the pair's DIRECT
 * conversation IN THE SAME TRANSACTION (find-or-create — never a duplicate),
 * decline marks DECLINED without a conversation, remove works for either
 * party on ACCEPTED, and an outsider gets 404 (no existence oracle).
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const aliceEmail = `com-rs-a-${suffix}@w17community.example`;
const bobEmail = `com-rs-b-${suffix}@w17community.example`;
const malloryEmail = `com-rs-m-${suffix}@w17community.example`;

let aliceId: string;
let bobId: string;
let malloryId: string;
let aliceToken: string;
let bobToken: string;
let malloryToken: string;
const allIds = () => [aliceId, bobId, malloryId];

function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/community/connections/respond`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function seedPending() {
  return prisma.citizenConnection.create({
    data: { requesterUserId: aliceId, addresseeUserId: bobId, kind: "FRIEND" },
  });
}

async function directConversationsBetween(a: string, b: string) {
  return prisma.conversation.findMany({
    where: {
      kind: "DIRECT",
      AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }],
    },
    include: { members: true },
  });
}

beforeAll(async () => {
  const [a, b, m] = await Promise.all([
    prisma.user.create({ data: { email: aliceEmail } }),
    prisma.user.create({ data: { email: bobEmail } }),
    prisma.user.create({ data: { email: malloryEmail } }),
  ]);
  aliceId = a.id;
  bobId = b.id;
  malloryId = m.id;
  [{ token: aliceToken }, { token: bobToken }, { token: malloryToken }] = await Promise.all([
    createSession(aliceId),
    createSession(bobId),
    createSession(malloryId),
  ]);
});

async function cleanup() {
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
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.user.deleteMany({ where: { id: { in: allIds() } } });
  await prisma.$disconnect();
});

describe("POST /api/community/connections/respond", () => {
  it("403 on a foreign origin, 401 without a session, 400 on bad bodies", async () => {
    const c = await seedPending();
    expect(
      (
        await POST(
          postReq(
            { connectionId: c.id, action: "accept" },
            { token: bobToken, origin: "https://evil.example" },
          ),
        )
      ).status,
    ).toBe(403);
    expect((await POST(postReq({ connectionId: c.id, action: "accept" }))).status).toBe(401);
    expect(
      (await POST(postReq({ connectionId: c.id, action: "befriend" }, { token: bobToken }))).status,
    ).toBe(400);
    expect(
      (await POST(postReq({ connectionId: c.id, action: "accept", x: 1 }, { token: bobToken })))
        .status,
    ).toBe(400);
  });

  it("404 for an unknown id AND for a connection the caller is no party to", async () => {
    const c = await seedPending();
    expect(
      (await POST(postReq({ connectionId: "nope", action: "accept" }, { token: bobToken }))).status,
    ).toBe(404);
    expect(
      (await POST(postReq({ connectionId: c.id, action: "accept" }, { token: malloryToken })))
        .status,
    ).toBe(404);
  });

  it("only the ADDRESSEE may accept or decline", async () => {
    const c = await seedPending();
    expect(
      (await POST(postReq({ connectionId: c.id, action: "accept" }, { token: aliceToken }))).status,
    ).toBe(403);
    expect(
      (await POST(postReq({ connectionId: c.id, action: "decline" }, { token: aliceToken })))
        .status,
    ).toBe(403);
  });

  it("accept → ACCEPTED and the DIRECT conversation exists atomically; a second accept is 409", async () => {
    const c = await seedPending();
    const res = await POST(postReq({ connectionId: c.id, action: "accept" }, { token: bobToken }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; status: string; conversationId: string };
    expect(data.status).toBe("ACCEPTED");

    const row = await prisma.citizenConnection.findUnique({ where: { id: c.id } });
    expect(row?.status).toBe("ACCEPTED");
    expect(row?.respondedAt).not.toBeNull();

    const convos = await directConversationsBetween(aliceId, bobId);
    expect(convos).toHaveLength(1);
    expect(convos[0]!.id).toBe(data.conversationId);
    expect(new Set(convos[0]!.members.map((m) => m.userId))).toEqual(new Set([aliceId, bobId]));

    expect(
      (await POST(postReq({ connectionId: c.id, action: "accept" }, { token: bobToken }))).status,
    ).toBe(409);
  });

  it("decline → DECLINED, and NO conversation is created", async () => {
    const c = await seedPending();
    const res = await POST(postReq({ connectionId: c.id, action: "decline" }, { token: bobToken }));
    expect(res.status).toBe(200);
    expect((await prisma.citizenConnection.findUnique({ where: { id: c.id } }))?.status).toBe(
      "DECLINED",
    );
    expect(await directConversationsBetween(aliceId, bobId)).toHaveLength(0);
  });

  it("remove works for EITHER party on ACCEPTED (and 409 on PENDING)", async () => {
    const c = await seedPending();
    expect(
      (await POST(postReq({ connectionId: c.id, action: "remove" }, { token: aliceToken }))).status,
    ).toBe(409); // still pending

    await POST(postReq({ connectionId: c.id, action: "accept" }, { token: bobToken }));
    // the REQUESTER removes — either party may.
    const res = await POST(
      postReq({ connectionId: c.id, action: "remove" }, { token: aliceToken }),
    );
    expect(res.status).toBe(200);
    expect((await prisma.citizenConnection.findUnique({ where: { id: c.id } }))?.status).toBe(
      "REMOVED",
    );
  });

  it("re-accepting a re-armed pair REUSES the old DIRECT conversation", async () => {
    const c = await seedPending();
    await POST(postReq({ connectionId: c.id, action: "accept" }, { token: bobToken }));
    await POST(postReq({ connectionId: c.id, action: "remove" }, { token: bobToken }));

    // Re-request (as the connections route would): same row back to PENDING, swapped.
    await prisma.citizenConnection.update({
      where: { id: c.id },
      data: {
        requesterUserId: bobId,
        addresseeUserId: aliceId,
        status: "PENDING",
        respondedAt: null,
      },
    });
    const res = await POST(
      postReq({ connectionId: c.id, action: "accept" }, { token: aliceToken }),
    );
    expect(res.status).toBe(200);
    expect(await directConversationsBetween(aliceId, bobId)).toHaveLength(1); // find-or-create
  });
});
