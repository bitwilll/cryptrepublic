// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

/**
 * /api/community/messages (Wave 17). Real prisma. Asserts: member-only 403,
 * the DIRECT dead-line rule (connection no longer ACCEPTED → 403, history
 * kept), verbatim plain-text storage (markup stays inert data), zod bounds,
 * and that GROUP posting needs membership only — no pairwise connection.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const aliceEmail = `com-sg-a-${suffix}@w17community.example`;
const bobEmail = `com-sg-b-${suffix}@w17community.example`;
const malloryEmail = `com-sg-m-${suffix}@w17community.example`;

let aliceId: string;
let bobId: string;
let malloryId: string;
let aliceToken: string;
let malloryToken: string;
const allIds = () => [aliceId, bobId, malloryId];

function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/community/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function seedAcceptedPair() {
  await prisma.citizenConnection.create({
    data: {
      requesterUserId: aliceId,
      addresseeUserId: bobId,
      kind: "FRIEND",
      status: "ACCEPTED",
      respondedAt: new Date(),
    },
  });
  return prisma.conversation.create({
    data: { kind: "DIRECT", members: { create: [{ userId: aliceId }, { userId: bobId }] } },
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
  [{ token: aliceToken }, { token: malloryToken }] = await Promise.all([
    createSession(aliceId),
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

describe("POST /api/community/messages", () => {
  it("403 foreign origin, 401 no session, 400 on zod bounds", async () => {
    const convo = await seedAcceptedPair();
    expect(
      (
        await POST(
          postReq(
            { conversationId: convo.id, body: "hi" },
            { token: aliceToken, origin: "https://evil.example" },
          ),
        )
      ).status,
    ).toBe(403);
    expect((await POST(postReq({ conversationId: convo.id, body: "hi" }))).status).toBe(401);
    expect(
      (await POST(postReq({ conversationId: convo.id, body: "" }, { token: aliceToken }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          postReq({ conversationId: convo.id, body: "x".repeat(2001) }, { token: aliceToken }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          postReq({ conversationId: convo.id, body: "hi", extra: 1 }, { token: aliceToken }),
        )
      ).status,
    ).toBe(400);
  });

  it("403 for non-members and for members who LEFT", async () => {
    const convo = await seedAcceptedPair();
    expect(
      (await POST(postReq({ conversationId: convo.id, body: "hi" }, { token: malloryToken })))
        .status,
    ).toBe(403);

    await prisma.conversationMember.updateMany({
      where: { conversationId: convo.id, userId: aliceId },
      data: { leftAt: new Date() },
    });
    expect(
      (await POST(postReq({ conversationId: convo.id, body: "hi" }, { token: aliceToken }))).status,
    ).toBe(403);
  });

  it("stores the body VERBATIM — markup and whitespace are inert data", async () => {
    const convo = await seedAcceptedPair();
    const body = "<b>bold?</b>\n  two spaces & a €";
    const res = await POST(postReq({ conversationId: convo.id, body }, { token: aliceToken }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; message: { id: string; body: string } };
    expect(data.message.body).toBe(body);
    const row = await prisma.directMessage.findUnique({ where: { id: data.message.id } });
    expect(row?.body).toBe(body);
    expect(row?.senderUserId).toBe(aliceId);
  });

  it("DIRECT: 403 once the connection is no longer ACCEPTED — history intact", async () => {
    const convo = await seedAcceptedPair();
    await POST(postReq({ conversationId: convo.id, body: "while friends" }, { token: aliceToken }));

    await prisma.citizenConnection.updateMany({
      where: { requesterUserId: aliceId, addresseeUserId: bobId },
      data: { status: "REMOVED" },
    });
    const res = await POST(
      postReq({ conversationId: convo.id, body: "after removal" }, { token: aliceToken }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(/no longer active/i);
    // the conversation and its history survive
    expect(await prisma.directMessage.count({ where: { conversationId: convo.id } })).toBe(1);
  });

  it("GROUP: membership alone suffices — no pairwise connection needed", async () => {
    const group = await prisma.conversation.create({
      data: {
        kind: "GROUP",
        title: `Assembly ${suffix}`,
        creatorUserId: aliceId,
        members: {
          create: [{ userId: aliceId }, { userId: malloryId, addedBy: aliceId }],
        },
      },
    });
    const res = await POST(
      postReq({ conversationId: group.id, body: "present" }, { token: malloryToken }),
    );
    expect(res.status).toBe(200);
  });
});
