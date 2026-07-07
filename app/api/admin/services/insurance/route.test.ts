// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
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
import { GET } from "./route";
import { PATCH } from "./[id]/route";

/**
 * /api/admin/services/insurance (Wave 15 C). Real prisma. Asserts the Wave-9
 * admin contract: guard stack (non-admin 403 / suspended 401 / foreign origin
 * 403 / unknown key 400), the review-state machine (review/approve/decline;
 * decline REQUIRES a note; APPROVED/DECLINED are terminal), and that every
 * decision writes its AuditLog row in the SAME transaction with allowlisted
 * before/after snapshots (BigInt valueUsd as a string, never a secret column).
 */

let f: AdminFixtures;
const NOTE = "Cover my apartment against fire and flood damage.";

function itemParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function patchApp(id: string, o: { token?: string; origin?: string | null; body?: unknown }) {
  // adminMutation types POST/PUT/DELETE; the handler is invoked directly so the
  // Request method never routes — reuse the shared builder as-is.
  return PATCH(
    adminMutation("POST", `/api/admin/services/insurance/${id}`, o.body, o),
    itemParams(id),
  );
}

async function seedApplication(status = "SUBMITTED", product = "ASSET") {
  return prisma.insuranceApplication.create({
    data: {
      userId: f.userId,
      product,
      coverageNote: NOTE,
      valueUsd: product === "ASSET" ? 250_000n : null,
      status,
    },
  });
}

describe("/api/admin/services/insurance", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-svc-ins");
  });

  beforeEach(async () => {
    __resetRateLimit();
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: f.allIds } } });
    await prisma.insuranceApplication.deleteMany({ where: { userId: { in: f.allIds } } });
  });

  afterAll(async () => {
    await prisma.insuranceApplication.deleteMany({ where: { userId: { in: f.allIds } } });
    await cleanupAdminFixtures(f);
    await prisma.$disconnect();
  });

  it("PATCH: standard guard cases", async () => {
    const app = await seedApplication();
    expect(
      await standardGuardStatuses((o) => patchApp(app.id, o), f, { action: "review" }),
    ).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("GET requires an admin (401 anonymous / 403 role user); returns the queue with applicant + string valueUsd", async () => {
    await seedApplication();
    expect((await GET(adminGet("/api/admin/services/insurance"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/services/insurance", f.userToken))).status).toBe(403);

    const res = await GET(adminGet("/api/admin/services/insurance", f.adminToken));
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoSecretKeys(text);
    const { applications } = JSON.parse(text) as {
      applications: Array<{ valueUsd: string; user: { email: string }; status: string }>;
    };
    const mine = applications.find((a) => a.user.email === f.userEmail);
    expect(mine).toBeDefined();
    expect(mine!.valueUsd).toBe("250000");
    expect(mine!.status).toBe("SUBMITTED");
  });

  it("GET ?status= filters; an unknown status is 400", async () => {
    await seedApplication("SUBMITTED");
    await seedApplication("APPROVED", "HEALTH");

    const submitted = await GET(
      adminGet("/api/admin/services/insurance?status=SUBMITTED", f.adminToken),
    );
    const { applications } = (await submitted.json()) as {
      applications: Array<{ status: string }>;
    };
    expect(applications.every((a) => a.status === "SUBMITTED")).toBe(true);

    expect(
      (await GET(adminGet("/api/admin/services/insurance?status=BOGUS", f.adminToken))).status,
    ).toBe(400);
  });

  it("review: SUBMITTED → IN_REVIEW with an insurance.review audit row (before+after in the SAME tx)", async () => {
    const app = await seedApplication();
    const res = await patchApp(app.id, { token: f.adminToken, body: { action: "review" } });
    expect(res.status).toBe(200);
    expectNoSecretKeys(await res.text());

    const row = await prisma.insuranceApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(row.status).toBe("IN_REVIEW");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "insurance.review", targetId: app.id },
    });
    expect(audit.targetType).toBe("INSURANCE_APPLICATION");
    expect(audit.actorUserId).toBe(f.adminId);
    expect((JSON.parse(audit.beforeJson!) as { status: string }).status).toBe("SUBMITTED");
    const after = JSON.parse(audit.afterJson!) as { status: string; valueUsd: string };
    expect(after.status).toBe("IN_REVIEW");
    expect(after.valueUsd).toBe("250000"); // BigInt serialized through the allowlist
  });

  it("approve: works from SUBMITTED and IN_REVIEW; audit action insurance.approve", async () => {
    const a = await seedApplication("SUBMITTED");
    const b = await seedApplication("IN_REVIEW");
    expect(
      (await patchApp(a.id, { token: f.adminToken, body: { action: "approve" } })).status,
    ).toBe(200);
    expect(
      (await patchApp(b.id, { token: f.adminToken, body: { action: "approve" } })).status,
    ).toBe(200);
    expect(
      (await prisma.insuranceApplication.findUniqueOrThrow({ where: { id: a.id } })).status,
    ).toBe("APPROVED");
    expect(
      await prisma.auditLog.count({ where: { action: "insurance.approve", targetId: a.id } }),
    ).toBe(1);
  });

  it("decline REQUIRES a reviewNote (3..500); the note is stored and audited", async () => {
    const app = await seedApplication();

    const noNote = await patchApp(app.id, { token: f.adminToken, body: { action: "decline" } });
    expect(noNote.status).toBe(400);
    expect((await noNote.json()).error).toMatch(/requires a review note/i);
    expect(
      (await prisma.insuranceApplication.findUniqueOrThrow({ where: { id: app.id } })).status,
    ).toBe("SUBMITTED"); // untouched

    const declined = await patchApp(app.id, {
      token: f.adminToken,
      body: { action: "decline", reviewNote: "Declared value could not be substantiated." },
    });
    expect(declined.status).toBe(200);
    const row = await prisma.insuranceApplication.findUniqueOrThrow({ where: { id: app.id } });
    expect(row.status).toBe("DECLINED");
    expect(row.reviewNote).toMatch(/substantiated/);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "insurance.decline", targetId: app.id },
    });
    expect((JSON.parse(audit.afterJson!) as { reviewNote: string }).reviewNote).toMatch(
      /substantiated/,
    );
  });

  it("APPROVED/DECLINED are terminal; review of IN_REVIEW is 400; no audit row on a refused transition", async () => {
    const approved = await seedApplication("APPROVED");
    const declined = await seedApplication("DECLINED");
    const inReview = await seedApplication("IN_REVIEW");

    for (const [id, body] of [
      [approved.id, { action: "decline", reviewNote: "Too late." }],
      [declined.id, { action: "approve" }],
      [inReview.id, { action: "review" }],
    ] as const) {
      const res = await patchApp(id, { token: f.adminToken, body });
      expect(res.status).toBe(400);
    }
    expect(await prisma.auditLog.count({ where: { actorUserId: f.adminId } })).toBe(0);
  });

  it("404 for an unknown application id", async () => {
    const res = await patchApp("does-not-exist", {
      token: f.adminToken,
      body: { action: "review" },
    });
    expect(res.status).toBe(404);
  });
});
