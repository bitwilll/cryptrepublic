// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { CIVIC_ID_RE } from "@/lib/identity/civicId";
import { GET } from "./route";

/**
 * /api/community/me (Wave 17). Real prisma against the local sqlite db.
 * Asserts the LAZY Civic ID assignment (null until first read, stable after)
 * and the connection counters — and that the payload never leaks an email
 * or userId.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const aliceEmail = `com-me-a-${suffix}@w17community.example`;
const bobEmail = `com-me-b-${suffix}@w17community.example`;
const carolEmail = `com-me-c-${suffix}@w17community.example`;
const daveEmail = `com-me-d-${suffix}@w17community.example`;

let aliceId: string;
let bobId: string;
let carolId: string;
let daveId: string;
let aliceToken: string;
const allIds = () => [aliceId, bobId, carolId, daveId];

function getReq(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/community/me`, { headers });
}

beforeAll(async () => {
  const [a, b, c, d] = await Promise.all([
    prisma.user.create({ data: { email: aliceEmail } }),
    prisma.user.create({ data: { email: bobEmail } }),
    prisma.user.create({ data: { email: carolEmail } }),
    prisma.user.create({ data: { email: daveEmail } }),
  ]);
  aliceId = a.id;
  bobId = b.id;
  carolId = c.id;
  daveId = d.id;
  ({ token: aliceToken } = await createSession(aliceId));
});

afterAll(async () => {
  await prisma.citizenConnection.deleteMany({
    where: {
      OR: [{ requesterUserId: { in: allIds() } }, { addresseeUserId: { in: allIds() } }],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: allIds() } } });
  await prisma.$disconnect();
});

describe("GET /api/community/me", () => {
  it("401 without a session", async () => {
    expect((await GET(getReq())).status).toBe(401);
  });

  it("lazily assigns the Civic ID on first read and keeps it stable", async () => {
    const before = await prisma.user.findUnique({
      where: { id: aliceId },
      select: { civicId: true },
    });
    expect(before?.civicId).toBeNull();

    const res = await GET(getReq({ token: aliceToken }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { civicId: string };
    expect(data.civicId).toMatch(CIVIC_ID_RE);

    const after = await prisma.user.findUnique({
      where: { id: aliceId },
      select: { civicId: true },
    });
    expect(after?.civicId).toBe(data.civicId);

    const again = (await (await GET(getReq({ token: aliceToken }))).json()) as {
      civicId: string;
    };
    expect(again.civicId).toBe(data.civicId); // stable — never re-rolled
  });

  it("counts incoming/outgoing pending and accepted (either direction) — and leaks nothing", async () => {
    await prisma.citizenConnection.create({
      data: { requesterUserId: bobId, addresseeUserId: aliceId, kind: "FRIEND" },
    });
    await prisma.citizenConnection.create({
      data: { requesterUserId: aliceId, addresseeUserId: carolId, kind: "FAMILY" },
    });
    await prisma.citizenConnection.create({
      data: {
        requesterUserId: daveId,
        addresseeUserId: aliceId,
        kind: "FRIEND",
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
    });

    const res = await GET(getReq({ token: aliceToken }));
    const raw = await res.text();
    const data = JSON.parse(raw) as {
      connectionCounts: { incoming: number; outgoing: number; accepted: number };
    };
    expect(data.connectionCounts).toEqual({ incoming: 1, outgoing: 1, accepted: 1 });

    // Privacy: my own endpoint carries no email and no userId of anyone.
    for (const email of [aliceEmail, bobEmail, carolEmail, daveEmail]) {
      expect(raw).not.toContain(email);
    }
    for (const id of allIds()) expect(raw).not.toContain(id);
  });
});
