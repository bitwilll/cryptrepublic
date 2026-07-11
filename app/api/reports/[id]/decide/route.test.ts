// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

/**
 * /api/reports/[id]/decide (Wave 17) — the decision machine for conduct
 * reports. Asserts the dual authority gate (officer via activeVerifierOffice,
 * else ADMIN; civilians 403), band validation (grade V penalty −50 is a 400),
 * conflict-of-interest 403s (own filing / self-subject — admins included),
 * SUBMITTED→VERIFIED|DISMISSED transitions with decidedBy/deciderOffice/
 * decidedAt, the Grade-V forfeiture (every active seat of the subject revoked
 * IN THE SAME transaction, one OFFICE_APPOINTMENT audit row per seat), and
 * that EVERY decision — officer or admin — writes a CITIZEN_REPORT audit row
 * whose snapshots exclude the complaint body and the reporter.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const officerEmail = `rep-d-officer-${suffix}@w17rep.example`;
const adminEmail = `rep-d-admin-${suffix}@w17rep.example`;
const civilianEmail = `rep-d-civilian-${suffix}@w17rep.example`;
const reporterEmail = `rep-d-reporter-${suffix}@w17rep.example`;
const subjectEmail = `rep-d-subject-${suffix}@w17rep.example`;

let officerId: string;
let adminId: string;
let civilianId: string;
let reporterId: string;
let subjectId: string;
let officerToken: string;
let adminToken: string;
let civilianToken: string;
let allIds: string[];

function postReq(id: string, body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/reports/${id}/decide`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
function decide(id: string, body: unknown, opts: { token?: string; origin?: string } = {}) {
  return POST(postReq(id, body, opts), { params: Promise.resolve({ id }) });
}
function verifyBody(over: Record<string, unknown> = {}) {
  return {
    action: "verify",
    grade: "II",
    penalty: -10,
    note: "Misrepresentation established against the registry record.",
    ...over,
  };
}

async function seedReport(over: Record<string, unknown> = {}) {
  return prisma.citizenReport.create({
    data: {
      reporterUserId: reporterId,
      subjectUserId: subjectId,
      category: "MISREPRESENTATION",
      body: `Secret complaint body ${suffix} — must never reach an audit snapshot.`,
      ...over,
    },
  });
}

beforeAll(async () => {
  const passwordHash = await hashPassword("correct horse battery staple");
  const officer = await prisma.user.create({ data: { email: officerEmail, passwordHash } });
  const admin = await prisma.user.create({
    data: { email: adminEmail, passwordHash, role: "ADMIN" },
  });
  const civilian = await prisma.user.create({ data: { email: civilianEmail, passwordHash } });
  const reporter = await prisma.user.create({ data: { email: reporterEmail, passwordHash } });
  const subject = await prisma.user.create({ data: { email: subjectEmail, passwordHash } });
  officerId = officer.id;
  adminId = admin.id;
  civilianId = civilian.id;
  reporterId = reporter.id;
  subjectId = subject.id;
  allIds = [officerId, adminId, civilianId, reporterId, subjectId];
  ({ token: officerToken } = await createSession(officerId));
  ({ token: adminToken } = await createSession(adminId));
  ({ token: civilianToken } = await createSession(civilianId));
  await prisma.officeAppointment.create({
    data: { userId: officerId, office: "PROTECTOR", appointedBy: adminId },
  });
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: allIds } } });
  await prisma.citizenReport.deleteMany({
    where: { OR: [{ reporterUserId: { in: allIds } }, { subjectUserId: { in: allIds } }] },
  });
  await prisma.officeAppointment.deleteMany({
    where: { userId: { in: [subjectId, reporterId, civilianId] } },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: allIds } } });
  await prisma.citizenReport.deleteMany({
    where: { OR: [{ reporterUserId: { in: allIds } }, { subjectUserId: { in: allIds } }] },
  });
  await prisma.officeAppointment.deleteMany({ where: { userId: { in: allIds } } });
  await prisma.user.deleteMany({ where: { id: { in: allIds } } });
  await prisma.$disconnect();
});

describe("POST /api/reports/[id]/decide — authority gate", () => {
  it("403 foreign origin; 401 anonymous; 403 civilian (no office, not admin)", async () => {
    const r = await seedReport();
    expect(
      (await decide(r.id, verifyBody(), { token: officerToken, origin: "https://evil.example" }))
        .status,
    ).toBe(403);
    expect((await decide(r.id, verifyBody())).status).toBe(401);
    expect((await decide(r.id, verifyBody(), { token: civilianToken })).status).toBe(403);
    expect((await prisma.citizenReport.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      "SUBMITTED",
    );
    expect(await prisma.auditLog.count({ where: { targetId: r.id } })).toBe(0);
  });

  it("404 for an unknown report id", async () => {
    expect((await decide("does-not-exist", verifyBody(), { token: adminToken })).status).toBe(404);
  });

  it("conflict of interest is a 403: own filing and self-subject — admins included", async () => {
    const officerFiling = await seedReport({ reporterUserId: officerId });
    const officerSubject = await seedReport({ subjectUserId: officerId });
    expect((await decide(officerFiling.id, verifyBody(), { token: officerToken })).status).toBe(
      403,
    );
    expect((await decide(officerSubject.id, verifyBody(), { token: officerToken })).status).toBe(
      403,
    );

    const adminFiling = await seedReport({ reporterUserId: adminId });
    const adminSubject = await seedReport({ subjectUserId: adminId });
    expect((await decide(adminFiling.id, verifyBody(), { token: adminToken })).status).toBe(403);
    expect((await decide(adminSubject.id, verifyBody(), { token: adminToken })).status).toBe(403);
    expect(await prisma.auditLog.count({ where: { actorUserId: { in: allIds } } })).toBe(0);
  });
});

describe("POST /api/reports/[id]/decide — validation", () => {
  it("band validation: grade V with penalty −50 is a 400 (outside −100..−60)", async () => {
    const r = await seedReport();
    const res = await decide(r.id, verifyBody({ grade: "V", penalty: -50 }), {
      token: officerToken,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Grade V penalties must be between -100 and -60/);
    expect((await prisma.citizenReport.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      "SUBMITTED",
    );
  });

  it("verify without a grade or note is a 400; dismiss needs neither", async () => {
    const r = await seedReport();
    expect(
      (
        await decide(
          r.id,
          { action: "verify", penalty: -10, note: "Missing the grade." },
          { token: officerToken },
        )
      ).status,
    ).toBe(400);
    expect((await decide(r.id, verifyBody({ note: "   " }), { token: officerToken })).status).toBe(
      400,
    );
    expect((await decide(r.id, { action: "dismiss" }, { token: officerToken })).status).toBe(200);
  });

  it("an already-decided report is a 400", async () => {
    const r = await seedReport({ status: "DISMISSED", decidedAt: new Date() });
    const res = await decide(r.id, verifyBody(), { token: adminToken });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already been decided/i);
  });
});

describe("POST /api/reports/[id]/decide — decisions + audit", () => {
  it("officer verify: SUBMITTED→VERIFIED with decider stamps; audit row excludes body + reporter", async () => {
    const r = await seedReport();
    const res = await decide(r.id, verifyBody(), { token: officerToken });
    expect(res.status).toBe(200);

    const row = await prisma.citizenReport.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({
      status: "VERIFIED",
      grade: "II",
      penalty: -10,
      decidedBy: officerId,
      deciderOffice: "PROTECTOR",
    });
    expect(row.decidedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "report.verify", targetId: r.id },
    });
    expect(audit.targetType).toBe("CITIZEN_REPORT");
    expect(audit.actorUserId).toBe(officerId);
    expect(audit.actorLabel).toBe(`officer:${officerEmail}`);
    // The allowlist excludes the complaint body and the reporter — EXACT.
    const snapshots = `${audit.beforeJson}${audit.afterJson}`;
    expect(snapshots).not.toContain("Secret complaint body");
    expect(snapshots).not.toContain(reporterId);
    expect(snapshots).not.toContain("reporterUserId");
    expect((JSON.parse(audit.afterJson!) as { status: string }).status).toBe("VERIFIED");
  });

  it("admin dismiss: deciderOffice ADMIN, note optional, audit row written", async () => {
    const r = await seedReport();
    const res = await decide(
      r.id,
      { action: "dismiss", note: "No evidence beyond the assertion." },
      { token: adminToken },
    );
    expect(res.status).toBe(200);
    const row = await prisma.citizenReport.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({
      status: "DISMISSED",
      grade: null,
      penalty: null,
      decidedBy: adminId,
      deciderOffice: "ADMIN",
      note: "No evidence beyond the assertion.",
    });
    expect(
      await prisma.auditLog.count({ where: { action: "report.dismiss", targetId: r.id } }),
    ).toBe(1);
  });

  it("grade V forfeiture: every ACTIVE seat of the subject revoked in the same decision; two audit kinds", async () => {
    const seatA = await prisma.officeAppointment.create({
      data: { userId: subjectId, office: "MINISTER", appointedBy: adminId },
    });
    const seatB = await prisma.officeAppointment.create({
      data: { userId: subjectId, office: "SENATOR", appointedBy: adminId },
    });
    const alreadyRevoked = await prisma.officeAppointment.create({
      data: {
        userId: subjectId,
        office: "LEGISLATOR",
        appointedBy: adminId,
        revokedAt: new Date("2026-01-01T00:00:00Z"),
        revokedBy: adminId,
      },
    });

    const r = await seedReport({ category: "FRAUD_UPON_REPUBLIC" });
    const res = await decide(
      r.id,
      verifyBody({ grade: "V", penalty: -80, note: "Fraud upon the Republic, established." }),
      { token: officerToken },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { forfeitedSeats: number }).forfeitedSeats).toBe(2);

    const report = await prisma.citizenReport.findUniqueOrThrow({ where: { id: r.id } });
    for (const seatId of [seatA.id, seatB.id]) {
      const seat = await prisma.officeAppointment.findUniqueOrThrow({ where: { id: seatId } });
      expect(seat.revokedBy).toBe(officerId);
      expect(seat.revokedAt?.getTime()).toBe(report.decidedAt?.getTime());
    }
    // The pre-existing revocation is untouched.
    const untouched = await prisma.officeAppointment.findUniqueOrThrow({
      where: { id: alreadyRevoked.id },
    });
    expect(untouched.revokedBy).toBe(adminId);
    expect(untouched.revokedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");

    // TWO audit kinds in the one transaction: 1 CITIZEN_REPORT + 1 per seat.
    expect(
      await prisma.auditLog.count({ where: { action: "report.verify", targetId: r.id } }),
    ).toBe(1);
    const forfeits = await prisma.auditLog.findMany({
      where: { action: "office.forfeit", targetId: { in: [seatA.id, seatB.id] } },
    });
    expect(forfeits).toHaveLength(2);
    for (const f of forfeits) {
      expect(f.targetType).toBe("OFFICE_APPOINTMENT");
      expect(f.actorUserId).toBe(officerId);
      expect((JSON.parse(f.afterJson!) as { revokedBy: string }).revokedBy).toBe(officerId);
    }
  });

  it("a non-V verification leaves the subject's seats untouched", async () => {
    const seat = await prisma.officeAppointment.create({
      data: { userId: subjectId, office: "MINISTER", appointedBy: adminId },
    });
    const r = await seedReport();
    expect((await decide(r.id, verifyBody(), { token: officerToken })).status).toBe(200);
    expect(
      (await prisma.officeAppointment.findUniqueOrThrow({ where: { id: seat.id } })).revokedAt,
    ).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { action: "office.forfeit", actorUserId: { in: allIds } },
      }),
    ).toBe(0);
  });
});
