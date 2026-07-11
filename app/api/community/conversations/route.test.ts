// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { getOrAssignCivicId } from "@/lib/identity/civicId";
import { GET } from "./route";

/**
 * /api/community/conversations (Wave 17). Real prisma. Asserts: only ACTIVE
 * memberships list (leftAt hides the group), DIRECT titles use the peer's
 * display, lastMessage excerpt + mine flag, unread counts only OTHERS'
 * messages newer than my lastReadAt, latest-activity sort — and that members
 * are { civicId, display, mine } with no email/userId anywhere.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const aliceEmail = `com-cv-a-${suffix}@w17community.example`;
const bobEmail = `com-cv-b-${suffix}@w17community.example`;
const carolEmail = `com-cv-c-${suffix}@w17community.example`;
const TOKEN_ID = `88${suffix.slice(0, 4)}`;

let aliceId: string;
let bobId: string;
let carolId: string;
let aliceToken: string;
let carolToken: string;
let bobCivicId: string;
const allIds = () => [aliceId, bobId, carolId];

function getReq(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/community/conversations`, { headers });
}

async function seedDirect(a: string, b: string) {
  return prisma.conversation.create({
    data: { kind: "DIRECT", members: { create: [{ userId: a }, { userId: b }] } },
  });
}
async function seedGroup(creator: string, others: string[], title: string) {
  return prisma.conversation.create({
    data: {
      kind: "GROUP",
      title,
      creatorUserId: creator,
      members: {
        create: [{ userId: creator }, ...others.map((userId) => ({ userId, addedBy: creator }))],
      },
    },
  });
}
async function seedMessage(conversationId: string, senderUserId: string, body: string, at: Date) {
  return prisma.directMessage.create({
    data: { conversationId, senderUserId, body, createdAt: at },
  });
}

beforeAll(async () => {
  const [a, b, c] = await Promise.all([
    prisma.user.create({ data: { email: aliceEmail } }),
    prisma.user.create({ data: { email: bobEmail } }),
    prisma.user.create({ data: { email: carolEmail } }),
  ]);
  aliceId = a.id;
  bobId = b.id;
  carolId = c.id;
  bobCivicId = await getOrAssignCivicId(bobId);
  [{ token: aliceToken }, { token: carolToken }] = await Promise.all([
    createSession(aliceId),
    createSession(carolId),
  ]);
  // Bob is a sealed citizen — his display is "Citizen № N" (cached tokenId).
  await prisma.citizenshipApplication.create({
    data: { userId: bobId, status: "MINTED", citizenTokenId: TOKEN_ID },
  });
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
  await prisma.citizenshipApplication.deleteMany({ where: { userId: { in: allIds() } } });
  await prisma.user.deleteMany({ where: { id: { in: allIds() } } });
  await prisma.$disconnect();
});

describe("GET /api/community/conversations", () => {
  it("401 without a session", async () => {
    expect((await GET(getReq())).status).toBe(401);
  });

  it("titles a DIRECT with the peer's display, carries members as {civicId, display, mine}, leaks nothing", async () => {
    await seedDirect(aliceId, bobId);
    const res = await GET(getReq({ token: aliceToken }));
    expect(res.status).toBe(200);
    const raw = await res.text();
    const data = JSON.parse(raw) as {
      conversations: Array<{
        kind: string;
        title: string;
        members: Array<{ civicId: string; display: string; mine: boolean }>;
        lastMessage: unknown;
        unread: number;
      }>;
    };
    expect(data.conversations).toHaveLength(1);
    const convo = data.conversations[0]!;
    expect(convo.kind).toBe("DIRECT");
    expect(convo.title).toBe(`Citizen № ${TOKEN_ID}`);
    expect(convo.lastMessage).toBeNull();
    expect(convo.unread).toBe(0);
    const peer = convo.members.find((m) => !m.mine);
    expect(peer?.civicId).toBe(bobCivicId);
    expect(peer?.display).toBe(`Citizen № ${TOKEN_ID}`);
    expect(convo.members.find((m) => m.mine)).toBeTruthy();

    for (const email of [aliceEmail, bobEmail, carolEmail]) expect(raw).not.toContain(email);
    for (const id of allIds()) expect(raw).not.toContain(id);
  });

  it("computes lastMessage excerpt + mine, unread (others only, after lastReadAt), and sorts by activity", async () => {
    const t0 = Date.now() - 60_000;
    const direct = await seedDirect(aliceId, bobId);
    const group = await seedGroup(aliceId, [bobId, carolId], `Council ${suffix}`);

    await seedMessage(direct.id, aliceId, "Mine — read it already", new Date(t0));
    await seedMessage(direct.id, bobId, "From Bob, unread", new Date(t0 + 10_000));
    await seedMessage(group.id, carolId, "x".repeat(300), new Date(t0 + 20_000));

    // Alice read the direct conversation up to t0+5s: Bob's later message is unread.
    await prisma.conversationMember.updateMany({
      where: { conversationId: direct.id, userId: aliceId },
      data: { lastReadAt: new Date(t0 + 5_000) },
    });

    const res = await GET(getReq({ token: aliceToken }));
    const data = (await res.json()) as {
      conversations: Array<{
        conversationId: string;
        title: string;
        lastMessage: { excerpt: string; mine: boolean } | null;
        unread: number;
      }>;
    };
    expect(data.conversations).toHaveLength(2);
    // The group got the newest message — it sorts first.
    expect(data.conversations[0]!.conversationId).toBe(group.id);
    expect(data.conversations[0]!.title).toBe(`Council ${suffix}`);
    expect(data.conversations[0]!.lastMessage?.mine).toBe(false);
    expect(data.conversations[0]!.lastMessage?.excerpt.length).toBeLessThanOrEqual(120);
    expect(data.conversations[0]!.lastMessage?.excerpt.endsWith("…")).toBe(true);
    // Group: alice never read → carol's message counts, alice's none exist.
    expect(data.conversations[0]!.unread).toBe(1);

    const directRow = data.conversations[1]!;
    expect(directRow.conversationId).toBe(direct.id);
    expect(directRow.lastMessage?.excerpt).toBe("From Bob, unread");
    expect(directRow.lastMessage?.mine).toBe(false);
    expect(directRow.unread).toBe(1); // only Bob's post-lastReadAt message; Alice's own never counts
  });

  it("hides conversations the caller has LEFT", async () => {
    const group = await seedGroup(aliceId, [bobId, carolId], `Old guard ${suffix}`);
    await prisma.conversationMember.updateMany({
      where: { conversationId: group.id, userId: carolId },
      data: { leftAt: new Date() },
    });
    const carolRes = await GET(getReq({ token: carolToken }));
    const carolData = (await carolRes.json()) as { conversations: unknown[] };
    expect(carolData.conversations).toHaveLength(0);

    const aliceRes = await GET(getReq({ token: aliceToken }));
    const aliceData = (await aliceRes.json()) as {
      conversations: Array<{ members: Array<{ mine: boolean }> }>;
    };
    expect(aliceData.conversations).toHaveLength(1);
    // Carol left — she is no longer among the ACTIVE members.
    expect(aliceData.conversations[0]!.members).toHaveLength(2);
  });
});
