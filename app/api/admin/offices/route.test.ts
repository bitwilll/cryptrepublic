// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import {
  seedAdminFixtures,
  cleanupAdminFixtures,
  adminGet,
  adminMutation,
  expectNoSecretKeys,
  standardGuardStatuses,
  STANDARD_GUARD_EXPECTED,
  type AdminFixtures,
} from "@/test/adminTestUtils";
import { GET, POST } from "./route";
import { POST as REVOKE } from "./revoke/route";

/**
 * /api/admin/offices (Wave 16). Real prisma. Asserts the Wave-9 admin
 * contract (guard stack), the precedence-sorted active roster, the ?q= user
 * search, the seat rules enforced IN THE TRANSACTION (same office twice →
 * 409; a unique office with a different holder → 409 naming the holder), the
 * revoke flow (revokedAt/revokedBy; 400 twice; 404 unknown), and that every
 * appointment/revocation writes its AuditLog row in the SAME transaction.
 * Offices are honours + display only — no auth privilege is granted.
 */

let f: AdminFixtures;
let secondCitizenId: string;
let secondCitizenEmail: string;
let searchTag: string;

function appoint(o: { token?: string; origin?: string | null; body?: unknown }) {
  return POST(adminMutation("POST", "/api/admin/offices", o.body, o));
}
function revoke(o: { token?: string; origin?: string | null; body?: unknown }) {
  return REVOKE(adminMutation("POST", "/api/admin/offices/revoke", o.body, o));
}

describe("/api/admin/offices", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-off");
    searchTag = `offsrch${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const second = await prisma.user.create({
      data: {
        email: `adm-off-second-${searchTag}@w16.example`,
        name: "Second Citizen",
        passwordHash: await hashPassword("correct horse battery staple"),
      },
    });
    secondCitizenId = second.id;
    secondCitizenEmail = second.email!;
  });

  beforeEach(async () => {
    __resetRateLimit();
    const ids = [...f.allIds, secondCitizenId];
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.officeAppointment.deleteMany({ where: { userId: { in: ids } } });
  });

  afterAll(async () => {
    await prisma.officeAppointment.deleteMany({
      where: { userId: { in: [...f.allIds, secondCitizenId] } },
    });
    await cleanupAdminFixtures(f, [secondCitizenId]);
    await prisma.$disconnect();
  });

  it("POST: standard guard cases", async () => {
    expect(
      await standardGuardStatuses((o) => appoint(o), f, {
        userId: f.userId,
        office: "SENATOR",
      }),
    ).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("GET requires an admin (401 anonymous / 403 role user)", async () => {
    expect((await GET(adminGet("/api/admin/offices"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/offices", f.userToken))).status).toBe(403);
  });

  it("appoint: creates an active appointment with an office.appoint audit row (null before)", async () => {
    const res = await appoint({
      token: f.adminToken,
      body: { userId: f.userId, office: "MINISTER", portfolio: "Treasury", note: "First cabinet" },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoSecretKeys(text);
    const { appointment } = JSON.parse(text) as {
      appointment: { id: string; office: string; portfolio: string; appointedBy: string };
    };
    expect(appointment).toMatchObject({
      office: "MINISTER",
      portfolio: "Treasury",
      appointedBy: f.adminId,
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "office.appoint", targetId: appointment.id },
    });
    expect(audit.targetType).toBe("OFFICE_APPOINTMENT");
    expect(audit.actorUserId).toBe(f.adminId);
    expect(audit.beforeJson).toBeNull();
    const after = JSON.parse(audit.afterJson!) as { office: string; userId: string };
    expect(after.office).toBe("MINISTER");
    expect(after.userId).toBe(f.userId);
  });

  it("the same citizen cannot hold the same office twice (409); a second senator is fine", async () => {
    expect(
      (await appoint({ token: f.adminToken, body: { userId: f.userId, office: "SENATOR" } }))
        .status,
    ).toBe(200);
    const dup = await appoint({
      token: f.adminToken,
      body: { userId: f.userId, office: "SENATOR" },
    });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toMatch(/already holds/i);
    // SENATOR is not a unique office — another citizen may hold it too.
    expect(
      (
        await appoint({
          token: f.adminToken,
          body: { userId: secondCitizenId, office: "SENATOR" },
        })
      ).status,
    ).toBe(200);
  });

  it("a unique office with a different active holder is a 409 naming the holder; free after revoke", async () => {
    const first = await appoint({
      token: f.adminToken,
      body: { userId: f.userId, office: "PRIME_MINISTER" },
    });
    expect(first.status).toBe(200);
    const { appointment } = (await first.json()) as { appointment: { id: string } };

    const contested = await appoint({
      token: f.adminToken,
      body: { userId: secondCitizenId, office: "PRIME_MINISTER" },
    });
    expect(contested.status).toBe(409);
    const body = (await contested.json()) as { error: string };
    expect(body.error).toContain(f.userEmail); // the 409 NAMES the current holder
    expect(body.error).toMatch(/revoke first/i);

    // Revoke the seat — the successor can now be appointed.
    expect(
      (await revoke({ token: f.adminToken, body: { appointmentId: appointment.id } })).status,
    ).toBe(200);
    expect(
      (
        await appoint({
          token: f.adminToken,
          body: { userId: secondCitizenId, office: "PRIME_MINISTER" },
        })
      ).status,
    ).toBe(200);
  });

  it("appointing an unknown citizen is a 404", async () => {
    expect(
      (
        await appoint({
          token: f.adminToken,
          body: { userId: "no-such-user", office: "LEGISLATOR" },
        })
      ).status,
    ).toBe(404);
  });

  it("revoke: stamps revokedAt/revokedBy with before/after audit; twice → 400; unknown → 404", async () => {
    const res = await appoint({
      token: f.adminToken,
      body: { userId: f.userId, office: "PROTECTOR" },
    });
    const { appointment } = (await res.json()) as { appointment: { id: string } };

    const revoked = await revoke({
      token: f.adminToken,
      body: { appointmentId: appointment.id, note: "Rotation of the guard." },
    });
    expect(revoked.status).toBe(200);
    const row = await prisma.officeAppointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokedBy).toBe(f.adminId);
    expect(row.note).toMatch(/rotation/i);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "office.revoke", targetId: appointment.id },
    });
    expect((JSON.parse(audit.beforeJson!) as { revokedAt: string | null }).revokedAt).toBeNull();
    expect(
      (JSON.parse(audit.afterJson!) as { revokedAt: string | null; revokedBy: string }).revokedBy,
    ).toBe(f.adminId);

    expect(
      (await revoke({ token: f.adminToken, body: { appointmentId: appointment.id } })).status,
    ).toBe(400);
    expect(
      (await revoke({ token: f.adminToken, body: { appointmentId: "no-such-row" } })).status,
    ).toBe(404);
  });

  it("GET: the roster is active-only, precedence-sorted, with citizen display + email", async () => {
    // Appoint in reverse precedence order — the roster must re-sort.
    await appoint({ token: f.adminToken, body: { userId: f.userId, office: "PROTECTOR" } });
    await appoint({
      token: f.adminToken,
      body: { userId: secondCitizenId, office: "MINISTER", portfolio: "Culture" },
    });
    await appoint({ token: f.adminToken, body: { userId: f.userId, office: "PRIME_MINISTER" } });

    // A revoked appointment must NOT appear.
    const senator = await appoint({
      token: f.adminToken,
      body: { userId: f.userId, office: "SENATOR" },
    });
    const { appointment } = (await senator.json()) as { appointment: { id: string } };
    await revoke({ token: f.adminToken, body: { appointmentId: appointment.id } });

    const res = await GET(adminGet("/api/admin/offices", f.adminToken));
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoSecretKeys(text);
    const { roster } = JSON.parse(text) as {
      roster: Array<{
        id: string;
        office: string;
        email: string | null;
        citizen: string;
        portfolio: string | null;
      }>;
    };
    const mine = roster.filter((r) => [f.userEmail, secondCitizenEmail].includes(r.email ?? ""));
    expect(mine.map((r) => r.office)).toEqual(["PRIME_MINISTER", "MINISTER", "PROTECTOR"]);
    expect(mine[1]).toMatchObject({ portfolio: "Culture", citizen: "Applicant" });
    expect(roster.find((r) => r.id === appointment.id)).toBeUndefined();
  });

  it("GET ?q= returns up to 10 user matches with their current offices; short q is ignored", async () => {
    await appoint({
      token: f.adminToken,
      body: { userId: secondCitizenId, office: "LEGISLATOR" },
    });

    const res = await GET(adminGet(`/api/admin/offices?q=${searchTag}`, f.adminToken));
    expect(res.status).toBe(200);
    const { users } = (await res.json()) as {
      users: Array<{ id: string; email: string; offices: Array<{ office: string }> }>;
    };
    expect(users.length).toBeGreaterThanOrEqual(1);
    expect(users.length).toBeLessThanOrEqual(10);
    const match = users.find((u) => u.id === secondCitizenId);
    expect(match).toBeDefined();
    expect(match!.email).toBe(secondCitizenEmail);
    expect(match!.offices.map((o) => o.office)).toContain("LEGISLATOR");

    // A 1-char q runs NO search — the payload has no users key.
    const short = await GET(adminGet("/api/admin/offices?q=a", f.adminToken));
    expect("users" in ((await short.json()) as Record<string, unknown>)).toBe(false);
  });
});
