// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { getOrAssignCivicId } from "@/lib/identity/civicId";
import { GET } from "./route";

/**
 * /api/community/conversations/[id]/messages (Wave 17). Real prisma.
 * Asserts: member-only 403 (outsiders, LEFT members, unknown ids — one
 * indistinguishable answer), newest-50 cursor paging, senders as
 * { civicId, display, mine }, the lastReadAt side effect, and the privacy
 * posture (no email/userId ever).
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const aliceEmail = `com-ms-a-${suffix}@w17community.example`;
const bobEmail = `com-ms-b-${suffix}@w17community.example`;
const malloryEmail = `com-ms-m-${suffix}@w17community.example`;

let aliceId: string;
let bobId: string;
let malloryId: string;
let aliceToken: string;
let malloryToken: string;
let bobCivicId: string;
const allIds = () => [aliceId, bobId, malloryId];

function getReq(conversationId: string, opts: { token?: string; cursor?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  const qs = opts.cursor ? `?cursor=${encodeURIComponent(opts.cursor)}` : "";
  return new Request(`${APP}/api/community/conversations/${conversationId}/messages${qs}`, {
    headers,
  });
}
function call(conversationId: string, opts: { token?: string; cursor?: string } = {}) {
  return GET(getReq(conversationId, opts), { params: Promise.resolve({ id: conversationId }) });
}

async function seedDirect() {
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
  bobCivicId = await getOrAssignCivicId(bobId);
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
}

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.user.deleteMany({ where: { id: { in: allIds() } } });
  await prisma.$disconnect();
});

describe("GET /api/community/conversations/[id]/messages", () => {
  it("401 without a session; 403 for non-members, LEFT members, and unknown ids alike", async () => {
    const convo = await seedDirect();
    expect((await call(convo.id)).status).toBe(401);
    expect((await call(convo.id, { token: malloryToken })).status).toBe(403);
    expect((await call("no-such-conversation", { token: aliceToken })).status).toBe(403);

    await prisma.conversationMember.updateMany({
      where: { conversationId: convo.id, userId: aliceId },
      data: { leftAt: new Date() },
    });
    expect((await call(convo.id, { token: aliceToken })).status).toBe(403);
  });

  it("returns newest 50 with a working cursor and marks my lastReadAt", async () => {
    const convo = await seedDirect();
    const t0 = Date.now() - 200_000;
    for (let i = 0; i < 51; i++) {
      await prisma.directMessage.create({
        data: {
          conversationId: convo.id,
          senderUserId: i % 2 === 0 ? aliceId : bobId,
          body: `Message ${i}`,
          createdAt: new Date(t0 + i * 1000),
        },
      });
    }

    const before = new Date();
    const res = await call(convo.id, { token: aliceToken });
    expect(res.status).toBe(200);
    const p1 = (await res.json()) as {
      messages: Array<{ id: string; body: string }>;
      nextCursor: string | null;
    };
    expect(p1.messages).toHaveLength(50);
    expect(p1.messages[0]!.body).toBe("Message 50"); // newest first
    expect(p1.nextCursor).toBe(p1.messages[49]!.id);

    const res2 = await call(convo.id, { token: aliceToken, cursor: p1.nextCursor! });
    const p2 = (await res2.json()) as {
      messages: Array<{ body: string }>;
      nextCursor: string | null;
    };
    expect(p2.messages).toHaveLength(1);
    expect(p2.messages[0]!.body).toBe("Message 0");
    expect(p2.nextCursor).toBeNull();

    const membership = await prisma.conversationMember.findFirst({
      where: { conversationId: convo.id, userId: aliceId },
    });
    expect(membership?.lastReadAt).not.toBeNull();
    expect(membership!.lastReadAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5);
  });

  it("shows senders as {civicId, display, mine} and never an email or userId", async () => {
    const convo = await seedDirect();
    const t0 = Date.now() - 10_000;
    await prisma.directMessage.create({
      data: {
        conversationId: convo.id,
        senderUserId: aliceId,
        body: "From me",
        createdAt: new Date(t0),
      },
    });
    await prisma.directMessage.create({
      data: {
        conversationId: convo.id,
        senderUserId: bobId,
        body: "From Bob",
        createdAt: new Date(t0 + 1000),
      },
    });

    const res = await call(convo.id, { token: aliceToken });
    const raw = await res.text();
    const data = JSON.parse(raw) as {
      messages: Array<{
        body: string;
        sender: { civicId: string; display: string; mine: boolean };
      }>;
    };
    const fromBob = data.messages.find((m) => m.body === "From Bob")!;
    const fromMe = data.messages.find((m) => m.body === "From me")!;
    expect(fromBob.sender.mine).toBe(false);
    expect(fromBob.sender.civicId).toBe(bobCivicId);
    expect(fromBob.sender.display).toBe("Applicant");
    expect(fromMe.sender.mine).toBe(true);

    for (const email of [aliceEmail, bobEmail, malloryEmail]) expect(raw).not.toContain(email);
    for (const id of allIds()) expect(raw).not.toContain(id);
  });
});
