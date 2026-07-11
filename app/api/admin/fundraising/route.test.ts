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
import { GET } from "./route";
import { POST } from "./[id]/route";

/**
 * /api/admin/fundraising (Wave 16). Real prisma. Asserts the Wave-9 admin
 * contract (guard stack), the three GET queues (submitted w/ endorsement
 * count + community-backed flag, active w/ BigInt-cents pledge totals,
 * decided newest-50), the decision machine (approve/decline/close; a decline
 * REQUIRES a note; illegal transitions 400; unknown id 404), and that every
 * decision writes its AuditLog row IN THE SAME transaction through the
 * FUNDRAISING_PROJECT allowlist. Registry rows only — no funds ever move.
 */

let f: AdminFixtures;
let endorserIds: string[] = [];

function postDecision(id: string, o: { token?: string; origin?: string | null; body?: unknown }) {
  return POST(adminMutation("POST", `/api/admin/fundraising/${id}`, o.body, o), {
    params: Promise.resolve({ id }),
  });
}

async function seedProject(status = "SUBMITTED", over: Record<string, unknown> = {}) {
  return prisma.fundraisingProject.create({
    data: {
      creatorUserId: f.userId,
      title: "Municipal solar array",
      summary: "A shared solar array for the digital district's off-grid embassies.",
      description:
        "Panels, inverters, and installation for the first Republic-owned solar array. " +
        "All contributions settle wallet-to-wallet with the project treasury.",
      category: "INFRASTRUCTURE",
      goalCoin: "50000",
      status,
      ...over,
    },
  });
}

describe("/api/admin/fundraising", () => {
  beforeAll(async () => {
    f = await seedAdminFixtures("adm-fund");
    // Seven endorsers push a project over the community-backed threshold.
    const passwordHash = await hashPassword("correct horse battery staple");
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    endorserIds = [];
    for (let i = 0; i < 7; i++) {
      const u = await prisma.user.create({
        data: { email: `adm-fund-endorser-${i}-${suffix}@w16.example`, passwordHash },
      });
      endorserIds.push(u.id);
    }
  });

  beforeEach(async () => {
    __resetRateLimit();
    const ids = [...f.allIds, ...endorserIds];
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.fundraisingProject.deleteMany({ where: { creatorUserId: { in: ids } } });
  });

  afterAll(async () => {
    await prisma.fundraisingProject.deleteMany({
      where: { creatorUserId: { in: [...f.allIds, ...endorserIds] } },
    });
    await cleanupAdminFixtures(f, endorserIds);
    await prisma.$disconnect();
  });

  it("POST: standard guard cases", async () => {
    const p = await seedProject();
    expect(
      await standardGuardStatuses((o) => postDecision(p.id, o), f, { action: "approve" }),
    ).toEqual(STANDARD_GUARD_EXPECTED);
  });

  it("GET requires an admin (401 anonymous / 403 role user)", async () => {
    expect((await GET(adminGet("/api/admin/fundraising"))).status).toBe(401);
    expect((await GET(adminGet("/api/admin/fundraising", f.userToken))).status).toBe(403);
  });

  it("GET: submitted queue carries endorsementCount + communityBacked + creator; no secrets leak", async () => {
    const cold = await seedProject();
    const backed = await seedProject("SUBMITTED", { title: "Archive digitisation" });
    await prisma.projectEndorsement.createMany({
      data: endorserIds.map((userId) => ({ projectId: backed.id, userId })),
    });
    await prisma.projectEndorsement.createMany({
      data: endorserIds.slice(0, 2).map((userId) => ({ projectId: cold.id, userId })),
    });

    const res = await GET(adminGet("/api/admin/fundraising", f.adminToken));
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoSecretKeys(text);
    const { submitted } = JSON.parse(text) as {
      submitted: Array<{
        id: string;
        endorsementCount: number;
        communityBacked: boolean;
        creator: { email: string | null };
        creatorDisplay: string;
      }>;
    };
    const coldRow = submitted.find((p) => p.id === cold.id);
    const backedRow = submitted.find((p) => p.id === backed.id);
    expect(coldRow).toMatchObject({ endorsementCount: 2, communityBacked: false });
    expect(backedRow).toMatchObject({ endorsementCount: 7, communityBacked: true });
    expect(backedRow!.creator.email).toBe(f.userEmail);
    expect(backedRow!.creatorDisplay).toBe("Applicant"); // no sealed passport in fixtures
  });

  it("GET: active projects sum PLEDGED amounts via BigInt cents and exclude WITHDRAWN pledges", async () => {
    const p = await seedProject("ACTIVE");
    await prisma.investmentPledge.create({
      data: { projectId: p.id, userId: endorserIds[0]!, amountCoin: "100.5" },
    });
    await prisma.investmentPledge.create({
      data: { projectId: p.id, userId: endorserIds[1]!, amountCoin: "24.25" },
    });
    await prisma.investmentPledge.create({
      data: { projectId: p.id, userId: endorserIds[2]!, amountCoin: "9999", status: "WITHDRAWN" },
    });

    const res = await GET(adminGet("/api/admin/fundraising", f.adminToken));
    const { active } = (await res.json()) as {
      active: Array<{ id: string; pledgeCount: number; pledgedTotalCoin: string }>;
    };
    const row = active.find((x) => x.id === p.id);
    expect(row).toMatchObject({ pledgeCount: 2, pledgedTotalCoin: "124.75" });
  });

  it("GET: decided queue lists DECLINED/CLOSED/WITHDRAWN with review notes", async () => {
    const declined = await seedProject("DECLINED", { reviewNote: "Goal is unsubstantiated." });
    const closed = await seedProject("CLOSED");
    const withdrawn = await seedProject("WITHDRAWN");
    const open = await seedProject("ACTIVE");

    const res = await GET(adminGet("/api/admin/fundraising", f.adminToken));
    const { decided } = (await res.json()) as {
      decided: Array<{ id: string; status: string; reviewNote: string | null }>;
    };
    const ids = decided.map((d) => d.id);
    expect(ids).toContain(declined.id);
    expect(ids).toContain(closed.id);
    expect(ids).toContain(withdrawn.id);
    expect(ids).not.toContain(open.id);
    expect(decided.find((d) => d.id === declined.id)!.reviewNote).toMatch(/unsubstantiated/i);
  });

  it("approve: SUBMITTED → ACTIVE stamps decidedBy/decidedAt; audit row in the SAME tx", async () => {
    const p = await seedProject();
    const res = await postDecision(p.id, { token: f.adminToken, body: { action: "approve" } });
    expect(res.status).toBe(200);
    expectNoSecretKeys(await res.text());

    const row = await prisma.fundraisingProject.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("ACTIVE");
    expect(row.decidedBy).toBe(f.adminId);
    expect(row.decidedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "fundraising.approve", targetId: p.id },
    });
    expect(audit.targetType).toBe("FUNDRAISING_PROJECT");
    expect(audit.actorUserId).toBe(f.adminId);
    expect((JSON.parse(audit.beforeJson!) as { status: string }).status).toBe("SUBMITTED");
    const after = JSON.parse(audit.afterJson!) as { status: string; decidedBy: string };
    expect(after.status).toBe("ACTIVE");
    expect(after.decidedBy).toBe(f.adminId);
  });

  it("decline REQUIRES a note (400 without, project untouched); the note is stored and audited", async () => {
    const p = await seedProject();

    const noNote = await postDecision(p.id, { token: f.adminToken, body: { action: "decline" } });
    expect(noNote.status).toBe(400);
    expect((await noNote.json()).error).toMatch(/requires a review note/i);
    expect(
      (await prisma.fundraisingProject.findUniqueOrThrow({ where: { id: p.id } })).status,
    ).toBe("SUBMITTED");

    const declined = await postDecision(p.id, {
      token: f.adminToken,
      body: { action: "decline", note: "The declared goal could not be substantiated." },
    });
    expect(declined.status).toBe(200);
    const row = await prisma.fundraisingProject.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("DECLINED");
    expect(row.reviewNote).toMatch(/substantiated/);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "fundraising.decline", targetId: p.id },
    });
    expect((JSON.parse(audit.afterJson!) as { reviewNote: string }).reviewNote).toMatch(
      /substantiated/,
    );
  });

  it("close: ACTIVE → CLOSED with a fundraising.close audit row", async () => {
    const p = await seedProject("ACTIVE");
    const res = await postDecision(p.id, { token: f.adminToken, body: { action: "close" } });
    expect(res.status).toBe(200);
    expect(
      (await prisma.fundraisingProject.findUniqueOrThrow({ where: { id: p.id } })).status,
    ).toBe("CLOSED");
    expect(
      await prisma.auditLog.count({ where: { action: "fundraising.close", targetId: p.id } }),
    ).toBe(1);
  });

  it("illegal transitions are 400 and write NO audit row", async () => {
    const active = await seedProject("ACTIVE");
    const declined = await seedProject("DECLINED");
    const closed = await seedProject("CLOSED");
    const submitted = await seedProject("SUBMITTED");

    for (const [id, body] of [
      [active.id, { action: "approve" }], // ACTIVE cannot be approved
      [declined.id, { action: "approve" }], // DECLINED is terminal
      [closed.id, { action: "decline", note: "Too late for a decline." }],
      [submitted.id, { action: "close" }], // only ACTIVE closes
    ] as const) {
      const res = await postDecision(id, { token: f.adminToken, body });
      expect(res.status).toBe(400);
    }
    expect(await prisma.auditLog.count({ where: { actorUserId: f.adminId } })).toBe(0);
  });

  it("404 for an unknown project id", async () => {
    const res = await postDecision("does-not-exist", {
      token: f.adminToken,
      body: { action: "approve" },
    });
    expect(res.status).toBe(404);
  });
});
