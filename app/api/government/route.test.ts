// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET } from "./route";

/**
 * /api/government (Wave 16 — government display). Real prisma against the
 * local sqlite db. The roster is GLOBAL (every active appointment), so
 * cross-suite assertions use contains/relative-order on rows this suite
 * seeded (unique declared names); `mine` is caller-scoped so it is asserted
 * EXACTLY. Asserts: session guard (401), protocol precedence + appointedAt
 * ordering, revoked exclusion, holder display preference (declared name >
 * cached "Citizen № N" > "Citizen"), mine correctness, and privacy (no email
 * ever leaves the registry).
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const NAME_TOKEN = `Zq${suffix.replace(/-/g, "")}`;

const pmEmail = `gov-pm-${suffix}@w16gov.example`;
const ministerEmail = `gov-min-${suffix}@w16gov.example`;
const senatorEmail = `gov-sen-${suffix}@w16gov.example`;
const plainEmail = `gov-plain-${suffix}@w16gov.example`;
const outsiderEmail = `gov-out-${suffix}@w16gov.example`;

const PM_NAME = `Prime ${NAME_TOKEN}`;
const REVOKED_NAME = `Revoked ${NAME_TOKEN}`;

let pmId: string;
let ministerId: string;
let senatorId: string;
let plainId: string;
let outsiderId: string;
let ministerToken: string;
let outsiderToken: string;

const allIds = () => [pmId, ministerId, senatorId, plainId, outsiderId];

function getReq(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/government`, { headers });
}

interface RosterRow {
  office: string;
  officeLabel: string;
  portfolio: string | null;
  holder: { display: string };
  appointedAt: string;
}
interface MineRow {
  office: string;
  officeLabel: string;
  portfolio: string | null;
  appointedAt: string;
}

async function fetchBody(token: string): Promise<{ roster: RosterRow[]; mine: MineRow[] }> {
  const res = await GET(getReq({ token }));
  expect(res.status).toBe(200);
  return (await res.json()) as { roster: RosterRow[]; mine: MineRow[] };
}

beforeAll(async () => {
  const t0 = Date.now() - 600_000;
  const [pm, minister, senator, plain, outsider] = await Promise.all([
    prisma.user.create({ data: { email: pmEmail } }),
    prisma.user.create({ data: { email: ministerEmail } }),
    prisma.user.create({ data: { email: senatorEmail } }),
    prisma.user.create({ data: { email: plainEmail } }),
    prisma.user.create({ data: { email: outsiderEmail } }),
  ]);
  pmId = pm.id;
  ministerId = minister.id;
  senatorId = senator.id;
  plainId = plain.id;
  outsiderId = outsider.id;
  ({ token: ministerToken } = await createSession(ministerId));
  ({ token: outsiderToken } = await createSession(outsiderId));

  // PM holder: declared name wins even though a cached tokenId exists.
  await prisma.citizenshipApplication.create({
    data: { userId: pmId, status: "MINTED", name: PM_NAME, citizenTokenId: "901" },
  });
  // Minister holder: no declared name → cached "Citizen № N".
  await prisma.citizenshipApplication.create({
    data: { userId: ministerId, status: "MINTED", citizenTokenId: "902" },
  });
  // Senator holder: no application row at all → "Citizen".

  // Seeded OUT of precedence order on purpose; appointedAt fixed for ordering.
  await prisma.officeAppointment.create({
    data: {
      userId: senatorId,
      office: "SENATOR",
      appointedBy: "test-admin",
      appointedAt: new Date(t0 + 1_000),
    },
  });
  await prisma.officeAppointment.create({
    data: {
      userId: ministerId,
      office: "MINISTER",
      portfolio: "Treasury",
      appointedBy: "test-admin",
      appointedAt: new Date(t0 + 2_000),
    },
  });
  // A SECOND minister appointed EARLIER — must precede the Treasury minister.
  await prisma.officeAppointment.create({
    data: {
      userId: pmId,
      office: "MINISTER",
      portfolio: "Archives",
      appointedBy: "test-admin",
      appointedAt: new Date(t0 + 500),
    },
  });
  await prisma.officeAppointment.create({
    data: {
      userId: pmId,
      office: "PRIME_MINISTER",
      appointedBy: "test-admin",
      appointedAt: new Date(t0 + 3_000),
    },
  });
  // Revoked appointment — must NEVER appear in roster or mine.
  await prisma.officeAppointment.create({
    data: {
      userId: plainId,
      office: "CHIEF_MINISTER",
      appointedBy: "test-admin",
      appointedAt: new Date(t0 + 4_000),
      revokedAt: new Date(t0 + 5_000),
      revokedBy: "test-admin",
    },
  });
  await prisma.citizenshipApplication.create({
    data: { userId: plainId, status: "MINTED", name: REVOKED_NAME },
  });
});

afterAll(async () => {
  await prisma.officeAppointment.deleteMany({ where: { userId: { in: allIds() } } });
  await prisma.citizenshipApplication.deleteMany({ where: { userId: { in: allIds() } } });
  await prisma.session.deleteMany({ where: { userId: { in: allIds() } } });
  await prisma.user.deleteMany({ where: { id: { in: allIds() } } });
  await prisma.$disconnect();
});

describe("GET /api/government", () => {
  it("401 without a session", async () => {
    expect((await GET(getReq())).status).toBe(401);
  });

  it("orders the roster by protocol precedence, then appointedAt ascending", async () => {
    const { roster } = await fetchBody(outsiderToken);
    // Only rows this suite seeded (unique names / token displays).
    const mineRows = roster.filter(
      (r) =>
        r.holder.display === PM_NAME ||
        r.holder.display === "Citizen № 902" ||
        (r.office === "SENATOR" && r.holder.display === "Citizen"),
    );
    const keys = mineRows.map((r) => `${r.office}:${r.portfolio ?? ""}`);
    const pmIdx = keys.indexOf("PRIME_MINISTER:");
    const minArchivesIdx = keys.indexOf("MINISTER:Archives");
    const minTreasuryIdx = keys.indexOf("MINISTER:Treasury");
    const senIdx = keys.indexOf("SENATOR:");
    expect(pmIdx).toBeGreaterThanOrEqual(0);
    expect(minArchivesIdx).toBeGreaterThanOrEqual(0);
    expect(minTreasuryIdx).toBeGreaterThanOrEqual(0);
    expect(senIdx).toBeGreaterThanOrEqual(0);
    // PM before every minister; within MINISTER, the earlier appointment first;
    // ministers before the senator.
    expect(pmIdx).toBeLessThan(minArchivesIdx);
    expect(minArchivesIdx).toBeLessThan(minTreasuryIdx);
    expect(minTreasuryIdx).toBeLessThan(senIdx);
  });

  it("labels offices and carries portfolio + appointedAt", async () => {
    const { roster } = await fetchBody(outsiderToken);
    const treasury = roster.find(
      (r) => r.holder.display === "Citizen № 902" && r.office === "MINISTER",
    );
    expect(treasury).toBeDefined();
    expect(treasury!.officeLabel).toBe("Minister");
    expect(treasury!.portfolio).toBe("Treasury");
    expect(new Date(treasury!.appointedAt).getTime()).not.toBeNaN();
    const pm = roster.find((r) => r.office === "PRIME_MINISTER" && r.holder.display === PM_NAME);
    expect(pm).toBeDefined();
    expect(pm!.officeLabel).toBe("Prime Minister");
  });

  it("excludes revoked appointments from the roster", async () => {
    const { roster } = await fetchBody(outsiderToken);
    expect(roster.some((r) => r.holder.display === REVOKED_NAME)).toBe(false);
    expect(
      roster.some((r) => r.office === "CHIEF_MINISTER" && r.holder.display === REVOKED_NAME),
    ).toBe(false);
  });

  it("holder display prefers declared name, then cached Citizen №, then 'Citizen'", async () => {
    const { roster } = await fetchBody(outsiderToken);
    // Declared name beats the cached tokenId (pm has BOTH).
    expect(roster.some((r) => r.holder.display === PM_NAME)).toBe(true);
    expect(roster.some((r) => r.holder.display === "Citizen № 901")).toBe(false);
    // TokenId without a name → "Citizen № N".
    expect(roster.some((r) => r.holder.display === "Citizen № 902")).toBe(true);
    // No application row at all → bare "Citizen" (the senator).
    expect(roster.some((r) => r.office === "SENATOR" && r.holder.display === "Citizen")).toBe(true);
  });

  it("mine returns EXACTLY the caller's active appointments in precedence order", async () => {
    const { mine } = await fetchBody(ministerToken);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      office: "MINISTER",
      officeLabel: "Minister",
      portfolio: "Treasury",
    });
    expect(new Date(mine[0]!.appointedAt).getTime()).not.toBeNaN();

    const pmSession = await createSession(pmId);
    const pmBody = await fetchBody(pmSession.token);
    expect(pmBody.mine.map((m) => `${m.office}:${m.portfolio ?? ""}`)).toEqual([
      "PRIME_MINISTER:",
      "MINISTER:Archives",
    ]);
  });

  it("mine is empty for an officeless caller and for a revoked-only holder", async () => {
    const { mine } = await fetchBody(outsiderToken);
    expect(mine).toEqual([]);

    const revokedSession = await createSession(plainId);
    const revokedBody = await fetchBody(revokedSession.token);
    expect(revokedBody.mine).toEqual([]);
  });

  it("never leaks an email, a userId, or a wallet address (privacy — exact)", async () => {
    const res = await GET(getReq({ token: outsiderToken }));
    const raw = await res.text();
    for (const email of [pmEmail, ministerEmail, senatorEmail, plainEmail, outsiderEmail]) {
      expect(raw).not.toContain(email);
    }
    for (const id of allIds()) {
      expect(raw).not.toContain(id);
    }
    expect(raw).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });
});
