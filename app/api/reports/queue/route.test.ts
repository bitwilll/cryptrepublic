// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { getOrAssignCivicId } from "@/lib/identity/civicId";
import { GET } from "./route";

/**
 * /api/reports/queue (Wave 17) — the Protectors' docket. Asserts the office
 * gate (401 anonymous, 403 civilian, 403 revoked appointment), the queue
 * contents (SUBMITTED only, filing order, subject Civic ID + display), the
 * conflict-of-interest exclusions (own filings, self-subject), and REPORTER
 * PRIVACY: no reporter identity — email, userId, or key — ever appears in the
 * officer payload. Privacy assertions are EXACT.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const officerEmail = `rep-q-officer-${suffix}@w17rep.example`;
const civilianEmail = `rep-q-civilian-${suffix}@w17rep.example`;
const reporterEmail = `rep-q-reporter-${suffix}@w17rep.example`;
const subjectEmail = `rep-q-subject-${suffix}@w17rep.example`;

let officerId: string;
let civilianId: string;
let reporterId: string;
let subjectId: string;
let officerToken: string;
let civilianToken: string;
let subjectCivicId: string;
let allIds: string[];

function getReq(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/reports/queue`, { headers });
}

async function seedReport(over: Record<string, unknown> = {}) {
  return prisma.citizenReport.create({
    data: {
      reporterUserId: reporterId,
      subjectUserId: subjectId,
      category: "MISREPRESENTATION",
      body: `Complaint body for the docket ${suffix}.`,
      ...over,
    },
  });
}

beforeAll(async () => {
  const officer = await prisma.user.create({ data: { email: officerEmail } });
  const civilian = await prisma.user.create({ data: { email: civilianEmail } });
  const reporter = await prisma.user.create({ data: { email: reporterEmail } });
  const subject = await prisma.user.create({ data: { email: subjectEmail } });
  officerId = officer.id;
  civilianId = civilian.id;
  reporterId = reporter.id;
  subjectId = subject.id;
  allIds = [officerId, civilianId, reporterId, subjectId];
  subjectCivicId = await getOrAssignCivicId(subjectId);
  ({ token: officerToken } = await createSession(officerId));
  ({ token: civilianToken } = await createSession(civilianId));
  await prisma.officeAppointment.create({
    data: { userId: officerId, office: "PROTECTOR", appointedBy: officerId },
  });
});

beforeEach(async () => {
  await prisma.citizenReport.deleteMany({
    where: {
      OR: [{ reporterUserId: { in: allIds } }, { subjectUserId: { in: allIds } }],
    },
  });
});

afterAll(async () => {
  await prisma.citizenReport.deleteMany({
    where: {
      OR: [{ reporterUserId: { in: allIds } }, { subjectUserId: { in: allIds } }],
    },
  });
  await prisma.officeAppointment.deleteMany({ where: { userId: { in: allIds } } });
  await prisma.user.deleteMany({ where: { id: { in: allIds } } });
  await prisma.$disconnect();
});

describe("GET /api/reports/queue", () => {
  it("401 anonymous; 403 for a civilian session", async () => {
    expect((await GET(getReq())).status).toBe(401);
    expect((await GET(getReq({ token: civilianToken }))).status).toBe(403);
  });

  it("403 once the officer's appointment is revoked (and again 200 when re-seated)", async () => {
    await prisma.officeAppointment.updateMany({
      where: { userId: officerId },
      data: { revokedAt: new Date(), revokedBy: officerId },
    });
    expect((await GET(getReq({ token: officerToken }))).status).toBe(403);
    await prisma.officeAppointment.create({
      data: { userId: officerId, office: "CHIEF_OF_PROTECTORS", appointedBy: officerId },
    });
    const res = await GET(getReq({ token: officerToken }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { office: string }).office).toBe("CHIEF_OF_PROTECTORS");
    // Restore the fixture seat for the remaining tests.
    await prisma.officeAppointment.deleteMany({
      where: { userId: officerId, office: "CHIEF_OF_PROTECTORS" },
    });
    await prisma.officeAppointment.updateMany({
      where: { userId: officerId },
      data: { revokedAt: null, revokedBy: null },
    });
  });

  it("lists SUBMITTED reports in filing order with subject Civic ID + display; decided ones excluded", async () => {
    const t0 = Date.now() - 60_000;
    const older = await seedReport({ createdAt: new Date(t0) });
    const newer = await seedReport({ createdAt: new Date(t0 + 10_000) });
    await seedReport({ status: "VERIFIED", grade: "I", penalty: -2, decidedAt: new Date() });
    await seedReport({ status: "DISMISSED", decidedAt: new Date() });

    const res = await GET(getReq({ token: officerToken }));
    expect(res.status).toBe(200);
    const { office, queue } = (await res.json()) as {
      office: string;
      queue: Array<Record<string, unknown>>;
    };
    expect(office).toBe("PROTECTOR");
    const mine = queue.filter((q) => q.subjectCivicId === subjectCivicId);
    expect(mine.map((q) => q.id)).toEqual([older.id, newer.id]); // filing order
    expect(mine[0]).toMatchObject({
      category: "MISREPRESENTATION",
      body: `Complaint body for the docket ${suffix}.`,
      subjectCivicId,
      subjectDisplay: "Applicant", // no sealed passport in fixtures
      reporterDisplay: "Citizen (withheld)",
    });
  });

  it("withholds the reporter ENTIRELY: no email, no userId, no reporter key in the payload", async () => {
    await seedReport();
    const res = await GET(getReq({ token: officerToken }));
    const text = await res.text();
    expect(text).not.toContain(reporterEmail);
    expect(text).not.toContain(reporterId);
    expect(text).not.toContain("reporterUserId");
    expect(text).not.toContain(subjectEmail);
    expect(text).not.toContain(subjectId); // subject appears as Civic ID only
    const { queue } = JSON.parse(text) as { queue: Array<Record<string, unknown>> };
    const row = queue.find((q) => q.subjectCivicId === subjectCivicId)!;
    expect(Object.keys(row).sort()).toEqual([
      "body",
      "category",
      "createdAt",
      "id",
      "reporterDisplay",
      "subjectCivicId",
      "subjectDisplay",
    ]);
  });

  it("excludes conflicts of interest: the officer's own filings and reports naming the officer", async () => {
    const ownFiling = await seedReport({ reporterUserId: officerId });
    const selfSubject = await seedReport({ subjectUserId: officerId });
    const clean = await seedReport();

    const res = await GET(getReq({ token: officerToken }));
    const { queue } = (await res.json()) as { queue: Array<{ id: string }> };
    const ids = queue.map((q) => q.id);
    expect(ids).toContain(clean.id);
    expect(ids).not.toContain(ownFiling.id);
    expect(ids).not.toContain(selfSubject.id);
  });
});
