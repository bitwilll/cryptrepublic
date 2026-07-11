// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  expectNoSecretKeys,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET } from "./route";

/**
 * /api/admin/reports (Wave 17) — the Conduct desk's three queues. Real
 * prisma. Asserts the admin guard (401 anonymous / 403 role user), that the
 * SUBMITTED queue carries the reporter's EMAIL + the complaint body (admins
 * see everything — the officer docket withholds both), the verified ledger's
 * grade / penalty / decider + office and the Grade-V forfeiture flag (matched
 * by decider + decision timestamp), and the dismissed ledger. Decisions
 * themselves POST to /api/reports/[id]/decide — no admin decide route exists.
 */

let f: AdminFixtures;
let subjectId: string;
let subjectEmail: string;

async function seedReport(over: Record<string, unknown> = {}) {
  return prisma.citizenReport.create({
    data: {
      reporterUserId: f.userId,
      subjectUserId: subjectId,
      category: "MISREPRESENTATION",
      body: "Complaint body visible to the Conduct desk.",
      ...over,
    },
  });
}

beforeAll(async () => {
  f = await seedAdminFixtures("adm-rep");
  const passwordHash = await hashPassword("correct horse battery staple");
  const subject = await prisma.user.create({
    data: {
      email: `adm-rep-subject-${Date.now()}-${Math.floor(Math.random() * 1e6)}@w9adm.example`,
      passwordHash,
    },
  });
  subjectId = subject.id;
  subjectEmail = subject.email!;
});

beforeEach(async () => {
  const ids = [...f.allIds, subjectId];
  await prisma.citizenReport.deleteMany({
    where: { OR: [{ reporterUserId: { in: ids } }, { subjectUserId: { in: ids } }] },
  });
  await prisma.officeAppointment.deleteMany({ where: { userId: subjectId } });
});

afterAll(async () => {
  const ids = [...f.allIds, subjectId];
  await prisma.citizenReport.deleteMany({
    where: { OR: [{ reporterUserId: { in: ids } }, { subjectUserId: { in: ids } }] },
  });
  await prisma.officeAppointment.deleteMany({ where: { userId: subjectId } });
  await cleanupAdminFixtures(f, [subjectId]);
  await prisma.$disconnect();
});

describe("GET /api/admin/reports", () => {
  it("requires an admin (401 anonymous / 403 role user / 401 suspended admin)", async () => {
    expect((await GET(adminGet("/api/admin/reports"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/reports", f.userToken))).status).toBe(403);
    expect((await GET(adminGet("/api/admin/reports", f.suspendedAdminToken))).status).toBe(401);
  });

  it("submitted queue carries reporter email + complaint body + subject display; no secrets leak", async () => {
    const r = await seedReport();
    const res = await GET(adminGet("/api/admin/reports", f.adminToken));
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoSecretKeys(text);
    const { submitted } = JSON.parse(text) as {
      submitted: Array<{
        id: string;
        body: string;
        category: string;
        reporter: { email: string | null };
        subject: { email: string | null };
        subjectDisplay: string;
      }>;
    };
    const row = submitted.find((x) => x.id === r.id)!;
    expect(row.reporter.email).toBe(f.userEmail); // admins see the reporter
    expect(row.subject.email).toBe(subjectEmail);
    expect(row.body).toBe("Complaint body visible to the Conduct desk.");
    expect(row.category).toBe("MISREPRESENTATION");
    expect(row.subjectDisplay).toBe("Applicant"); // no sealed passport in fixtures
  });

  it("verified ledger: grade/penalty/decider + office; Grade V flags OFFICES FORFEITED via matched revocations", async () => {
    const decidedAt = new Date();
    const plain = await seedReport({
      status: "VERIFIED",
      grade: "II",
      penalty: -10,
      note: "Established.",
      decidedBy: f.adminId,
      deciderOffice: "ADMIN",
      decidedAt: new Date(decidedAt.getTime() - 5_000),
    });
    const forfeiting = await seedReport({
      status: "VERIFIED",
      grade: "V",
      penalty: -80,
      note: "Fraud upon the Republic.",
      decidedBy: f.adminId,
      deciderOffice: "ADMIN",
      decidedAt,
    });
    // A seat revoked BY that decision (same decider, same timestamp)…
    await prisma.officeAppointment.create({
      data: {
        userId: subjectId,
        office: "MINISTER",
        appointedBy: f.adminId,
        revokedAt: decidedAt,
        revokedBy: f.adminId,
      },
    });
    // …and an unrelated earlier revocation that must NOT count.
    await prisma.officeAppointment.create({
      data: {
        userId: subjectId,
        office: "SENATOR",
        appointedBy: f.adminId,
        revokedAt: new Date(decidedAt.getTime() - 60_000),
        revokedBy: f.adminId,
      },
    });

    const res = await GET(adminGet("/api/admin/reports", f.adminToken));
    const { verified } = (await res.json()) as {
      verified: Array<{
        id: string;
        grade: string;
        penalty: number;
        note: string;
        deciderLabel: string | null;
        deciderOffice: string;
        officesForfeited: boolean;
        forfeitedSeats: number;
      }>;
    };
    const plainRow = verified.find((x) => x.id === plain.id)!;
    expect(plainRow).toMatchObject({
      grade: "II",
      penalty: -10,
      note: "Established.",
      deciderLabel: f.adminEmail,
      deciderOffice: "ADMIN",
      officesForfeited: false,
      forfeitedSeats: 0,
    });
    const vRow = verified.find((x) => x.id === forfeiting.id)!;
    expect(vRow).toMatchObject({ grade: "V", officesForfeited: true, forfeitedSeats: 1 });
  });

  it("dismissed ledger lists dismissals with decider + note; queues stay disjoint", async () => {
    const open = await seedReport();
    const dismissed = await seedReport({
      status: "DISMISSED",
      note: "No evidence beyond the assertion.",
      decidedBy: f.adminId,
      deciderOffice: "ADMIN",
      decidedAt: new Date(),
    });

    const res = await GET(adminGet("/api/admin/reports", f.adminToken));
    const data = (await res.json()) as {
      submitted: Array<{ id: string }>;
      verified: Array<{ id: string }>;
      dismissed: Array<{ id: string; note: string | null; deciderLabel: string | null }>;
    };
    const row = data.dismissed.find((x) => x.id === dismissed.id)!;
    expect(row.note).toBe("No evidence beyond the assertion.");
    expect(row.deciderLabel).toBe(f.adminEmail);
    expect(data.dismissed.map((x) => x.id)).not.toContain(open.id);
    expect(data.submitted.map((x) => x.id)).toContain(open.id);
    expect(data.submitted.map((x) => x.id)).not.toContain(dismissed.id);
  });
});
