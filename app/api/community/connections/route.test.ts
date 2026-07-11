// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { getOrAssignCivicId } from "@/lib/identity/civicId";
import { GET, POST } from "./route";

/**
 * /api/community/connections (Wave 17). Real prisma. Asserts the request
 * contract (origin/auth/zod, 404 unknown Civic ID, 400 self), the ONE ROW PER
 * PAIR rule in EITHER direction (PENDING→409, ACCEPTED→409, DECLINED/REMOVED
 * → the OLD row is re-armed with swapped requester), and the ledger's privacy
 * posture: outgoing pending entries carry the Civic ID ONLY — no display name
 * until acceptance — and no payload ever contains an email or userId.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const aliceEmail = `com-cn-a-${suffix}@w17community.example`;
const bobEmail = `com-cn-b-${suffix}@w17community.example`;
const carolEmail = `com-cn-c-${suffix}@w17community.example`;
const daveEmail = `com-cn-d-${suffix}@w17community.example`;
const UNKNOWN_CIVIC_ID = "CR-TSTS-TSTS"; // valid shape, held by nobody

let aliceId: string;
let bobId: string;
let carolId: string;
let daveId: string;
let aliceToken: string;
let bobToken: string;
let aliceCivicId: string;
let bobCivicId: string;
let carolCivicId: string;
let daveCivicId: string;
const allIds = () => [aliceId, bobId, carolId, daveId];

function getReq(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/community/connections`, { headers });
}
function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/community/connections`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
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
  [aliceCivicId, bobCivicId, carolCivicId, daveCivicId] = await Promise.all([
    getOrAssignCivicId(aliceId),
    getOrAssignCivicId(bobId),
    getOrAssignCivicId(carolId),
    getOrAssignCivicId(daveId),
  ]);
  [{ token: aliceToken }, { token: bobToken }] = await Promise.all([
    createSession(aliceId),
    createSession(bobId),
  ]);
});

beforeEach(async () => {
  await prisma.citizenConnection.deleteMany({
    where: {
      OR: [{ requesterUserId: { in: allIds() } }, { addresseeUserId: { in: allIds() } }],
    },
  });
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

describe("POST /api/community/connections", () => {
  it("403 on a foreign origin and 401 without a session", async () => {
    expect(
      (
        await POST(
          postReq(
            { civicId: bobCivicId, kind: "FRIEND" },
            { token: aliceToken, origin: "https://evil.example" },
          ),
        )
      ).status,
    ).toBe(403);
    expect((await POST(postReq({ civicId: bobCivicId, kind: "FRIEND" }))).status).toBe(401);
  });

  it("400 on malformed JSON, unknown keys, bad kind, and malformed Civic ID", async () => {
    const bad = new Request(`${APP}/api/community/connections`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP,
        cookie: `cr_session=${aliceToken}`,
      },
      body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);
    expect(
      (await POST(postReq({ civicId: bobCivicId, kind: "FRIEND", x: 1 }, { token: aliceToken })))
        .status,
    ).toBe(400);
    expect(
      (await POST(postReq({ civicId: bobCivicId, kind: "ENEMY" }, { token: aliceToken }))).status,
    ).toBe(400);
    expect(
      (await POST(postReq({ civicId: "CR-1111-1111", kind: "FRIEND" }, { token: aliceToken })))
        .status,
    ).toBe(400); // 1 is not in the Civic ID alphabet
  });

  it("404 when no citizen holds the Civic ID; 400 on self-connection", async () => {
    const res = await POST(
      postReq({ civicId: UNKNOWN_CIVIC_ID, kind: "FRIEND" }, { token: aliceToken }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("No citizen holds that Civic ID.");

    expect(
      (await POST(postReq({ civicId: aliceCivicId, kind: "FRIEND" }, { token: aliceToken })))
        .status,
    ).toBe(400);
  });

  it("files a PENDING request and reveals NOTHING about the target", async () => {
    const res = await POST(
      postReq(
        { civicId: bobCivicId, kind: "FAMILY", greeting: "It is me." },
        { token: aliceToken },
      ),
    );
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(JSON.parse(raw)).toEqual({ ok: true, filed: true });
    expect(raw).not.toContain(bobEmail);
    expect(raw).not.toContain(bobId);

    const row = await prisma.citizenConnection.findFirst({
      where: { requesterUserId: aliceId, addresseeUserId: bobId },
    });
    expect(row?.status).toBe("PENDING");
    expect(row?.kind).toBe("FAMILY");
    expect(row?.greeting).toBe("It is me.");
  });

  it("409 while PENDING — in EITHER direction — and 409 once ACCEPTED", async () => {
    await POST(postReq({ civicId: bobCivicId, kind: "FRIEND" }, { token: aliceToken }));

    const again = await POST(
      postReq({ civicId: bobCivicId, kind: "FRIEND" }, { token: aliceToken }),
    );
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toMatch(/awaiting response/i);

    const reverse = await POST(
      postReq({ civicId: aliceCivicId, kind: "FRIEND" }, { token: bobToken }),
    );
    expect(reverse.status).toBe(409);

    await prisma.citizenConnection.updateMany({
      where: { requesterUserId: aliceId, addresseeUserId: bobId },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    const onAccepted = await POST(
      postReq({ civicId: aliceCivicId, kind: "FRIEND" }, { token: bobToken }),
    );
    expect(onAccepted.status).toBe(409);
    expect(((await onAccepted.json()) as { error: string }).error).toMatch(/already connected/i);
  });

  it("re-arms the SAME row after DECLINED/REMOVED, swapping the requester when needed", async () => {
    const declined = await prisma.citizenConnection.create({
      data: {
        requesterUserId: aliceId,
        addresseeUserId: bobId,
        kind: "FRIEND",
        status: "DECLINED",
        respondedAt: new Date(),
      },
    });

    // Bob re-requests toward Alice: the old row flips direction, back to PENDING.
    const res = await POST(
      postReq(
        { civicId: aliceCivicId, kind: "FAMILY", greeting: "Try again" },
        { token: bobToken },
      ),
    );
    expect(res.status).toBe(200);

    const rows = await prisma.citizenConnection.findMany({
      where: {
        OR: [
          { requesterUserId: aliceId, addresseeUserId: bobId },
          { requesterUserId: bobId, addresseeUserId: aliceId },
        ],
      },
    });
    expect(rows).toHaveLength(1); // still ONE row per pair
    expect(rows[0]!.id).toBe(declined.id);
    expect(rows[0]!.requesterUserId).toBe(bobId);
    expect(rows[0]!.addresseeUserId).toBe(aliceId);
    expect(rows[0]!.status).toBe("PENDING");
    expect(rows[0]!.kind).toBe("FAMILY");
    expect(rows[0]!.greeting).toBe("Try again");
    expect(rows[0]!.respondedAt).toBeNull();
  });
});

describe("GET /api/community/connections", () => {
  it("401 without a session", async () => {
    expect((await GET(getReq())).status).toBe(401);
  });

  it("splits the ledger and NEVER names an addressee before acceptance", async () => {
    // incoming: bob → alice (PENDING); outgoing: alice → carol (PENDING);
    // accepted: dave ↔ alice.
    await prisma.citizenConnection.create({
      data: {
        requesterUserId: bobId,
        addresseeUserId: aliceId,
        kind: "FRIEND",
        greeting: "Hello!",
      },
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
    expect(res.status).toBe(200);
    const raw = await res.text();
    const data = JSON.parse(raw) as {
      incoming: Array<{
        connectionId: string;
        kind: string;
        greeting: string | null;
        requester: { civicId: string; display: string };
        createdAt: string;
      }>;
      outgoing: Array<Record<string, unknown>>;
      accepted: Array<{ kind: string; peer: { civicId: string; display: string }; since: string }>;
    };

    expect(data.incoming).toHaveLength(1);
    expect(data.incoming[0]!.requester.civicId).toBe(bobCivicId);
    expect(data.incoming[0]!.requester.display).toBe("Applicant");
    expect(data.incoming[0]!.greeting).toBe("Hello!");
    expect(data.incoming[0]!.kind).toBe("FRIEND");

    // PRIVACY: outgoing pending shows the Civic ID ONLY — exact key set, no display.
    expect(data.outgoing).toHaveLength(1);
    expect(Object.keys(data.outgoing[0]!).sort()).toEqual([
      "civicId",
      "connectionId",
      "createdAt",
      "kind",
    ]);
    expect(data.outgoing[0]!.civicId).toBe(carolCivicId);

    expect(data.accepted).toHaveLength(1);
    expect(data.accepted[0]!.peer.civicId).toBe(daveCivicId);
    expect(data.accepted[0]!.peer.display).toBe("Applicant");

    // PRIVACY: exact — no email and no userId anywhere in the payload.
    for (const email of [aliceEmail, bobEmail, carolEmail, daveEmail]) {
      expect(raw).not.toContain(email);
    }
    for (const id of allIds()) expect(raw).not.toContain(id);
  });

  it("shows 'Citizen № N' for a sealed requester (cached tokenId, no chain)", async () => {
    await prisma.citizenshipApplication.create({
      data: { userId: bobId, status: "MINTED", citizenTokenId: `77${suffix.slice(0, 4)}` },
    });
    await prisma.citizenConnection.create({
      data: { requesterUserId: bobId, addresseeUserId: aliceId, kind: "FRIEND" },
    });
    const res = await GET(getReq({ token: aliceToken }));
    const data = (await res.json()) as {
      incoming: Array<{ requester: { display: string } }>;
    };
    expect(data.incoming[0]!.requester.display).toBe(`Citizen № 77${suffix.slice(0, 4)}`);
    await prisma.citizenshipApplication.deleteMany({ where: { userId: bobId } });
  });
});
