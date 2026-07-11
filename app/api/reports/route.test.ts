// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { getOrAssignCivicId } from "@/lib/identity/civicId";
import { GET, POST } from "./route";
import { OPEN_REPORT_CAP } from "@/lib/gov/types";

/**
 * /api/reports (Wave 17 conduct reports). Real prisma against the shared
 * sqlite test db. Asserts the filing contract (origin 403 / auth 401 / zod
 * 400s / Civic ID normalization / 404 unknown id / self-report 400 / the
 * 3-open-reports cap) and the two-sided GET: filed reports show the subject
 * as CIVIC ID ONLY and NEVER the decision note; the subject sees VERIFIED
 * charges (with note + penalty) but never SUBMITTED / DISMISSED ones, and
 * never the reporter's identity. Privacy assertions are EXACT.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const reporterEmail = `rep-file-r-${suffix}@w17rep.example`;
const subjectEmail = `rep-file-s-${suffix}@w17rep.example`;

let reporterId: string;
let subjectId: string;
let reporterToken: string;
let subjectToken: string;
let subjectCivicId: string;
let reporterCivicId: string;

function getReq(opts: { token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/reports`, { headers });
}
function postReq(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(`${APP}/api/reports`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    subjectCivicId,
    category: "MISREPRESENTATION",
    body: "The subject misrepresented the provenance of a listed artifact to buyers.",
    ...overrides,
  };
}

beforeAll(async () => {
  const reporter = await prisma.user.create({ data: { email: reporterEmail } });
  const subject = await prisma.user.create({ data: { email: subjectEmail } });
  reporterId = reporter.id;
  subjectId = subject.id;
  subjectCivicId = await getOrAssignCivicId(subjectId);
  reporterCivicId = await getOrAssignCivicId(reporterId);
  ({ token: reporterToken } = await createSession(reporterId));
  ({ token: subjectToken } = await createSession(subjectId));
});

beforeEach(async () => {
  await prisma.citizenReport.deleteMany({
    where: {
      OR: [
        { reporterUserId: { in: [reporterId, subjectId] } },
        { subjectUserId: { in: [reporterId, subjectId] } },
      ],
    },
  });
});

afterAll(async () => {
  await prisma.citizenReport.deleteMany({
    where: {
      OR: [
        { reporterUserId: { in: [reporterId, subjectId] } },
        { subjectUserId: { in: [reporterId, subjectId] } },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: [reporterId, subjectId] } } });
  await prisma.$disconnect();
});

describe("POST /api/reports (filing)", () => {
  it("403 on a foreign origin; 401 without a session", async () => {
    expect(
      (await POST(postReq(validBody(), { token: reporterToken, origin: "https://evil.example" })))
        .status,
    ).toBe(403);
    expect((await POST(postReq(validBody()))).status).toBe(401);
  });

  it("400 on schema violations (malformed id, short body, unknown key)", async () => {
    for (const body of [
      validBody({ subjectCivicId: "CR-NOPE" }),
      validBody({ body: "too short" }),
      validBody({ zz_unknown: 1 }),
      validBody({ category: "NOT_A_CATEGORY" }),
    ]) {
      expect((await POST(postReq(body, { token: reporterToken }))).status).toBe(400);
    }
    expect(await prisma.citizenReport.count({ where: { reporterUserId: reporterId } })).toBe(0);
  });

  it("normalizes a hand-typed Civic ID (lowercase, spaced dashes)", async () => {
    const sloppy = ` ${subjectCivicId.toLowerCase().replace(/-/g, " — ")} `;
    const res = await POST(
      postReq(validBody({ subjectCivicId: sloppy }), { token: reporterToken }),
    );
    expect(res.status).toBe(200);
    const { report } = (await res.json()) as { report: { subjectCivicId: string } };
    expect(report.subjectCivicId).toBe(subjectCivicId);
    const row = await prisma.citizenReport.findFirstOrThrow({
      where: { reporterUserId: reporterId },
    });
    expect(row.subjectUserId).toBe(subjectId);
  });

  it("404 for an unknown Civic ID", async () => {
    const res = await POST(
      postReq(validBody({ subjectCivicId: "CR-2345-6789" }), { token: reporterToken }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("No citizen holds that Civic ID.");
  });

  it("400 for a self-report", async () => {
    const res = await POST(
      postReq(validBody({ subjectCivicId: reporterCivicId }), { token: reporterToken }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/yourself/i);
  });

  it(`caps open reports at ${OPEN_REPORT_CAP} SUBMITTED per reporter (decided ones do not count)`, async () => {
    for (let i = 0; i < OPEN_REPORT_CAP; i++) {
      expect((await POST(postReq(validBody(), { token: reporterToken }))).status).toBe(200);
    }
    const capped = await POST(postReq(validBody(), { token: reporterToken }));
    expect(capped.status).toBe(400);
    expect((await capped.json()).error).toMatch(/awaiting verification/i);

    // A decision frees a slot.
    const one = await prisma.citizenReport.findFirstOrThrow({
      where: { reporterUserId: reporterId, status: "SUBMITTED" },
    });
    await prisma.citizenReport.update({
      where: { id: one.id },
      data: { status: "DISMISSED", decidedAt: new Date() },
    });
    expect((await POST(postReq(validBody(), { token: reporterToken }))).status).toBe(200);
  });

  it("acceptance response reveals NOTHING about the subject beyond the Civic ID supplied", async () => {
    const res = await POST(postReq(validBody(), { token: reporterToken }));
    expect(res.status).toBe(200);
    const text = await res.text();
    // Exact privacy assertions: no subject email, userId, or display identity.
    expect(text).not.toContain(subjectEmail);
    expect(text).not.toContain(subjectId);
    expect(text).not.toContain("subjectUserId");
    const { report } = JSON.parse(text) as { report: Record<string, unknown> };
    expect(Object.keys(report).sort()).toEqual([
      "category",
      "createdAt",
      "id",
      "status",
      "subjectCivicId",
    ]);
  });
});

describe("GET /api/reports (my record)", () => {
  it("401 without a session", async () => {
    expect((await GET(getReq())).status).toBe(401);
  });

  it("filed reports show subject as CIVIC ID ONLY; grade+decidedAt once decided; NEVER the note", async () => {
    const note = `Confirmed against the registry ${suffix}.`;
    await prisma.citizenReport.create({
      data: {
        reporterUserId: reporterId,
        subjectUserId: subjectId,
        category: "CIVIC_NEGLIGENCE",
        body: "Open report awaiting verification by the Protectors.",
      },
    });
    await prisma.citizenReport.create({
      data: {
        reporterUserId: reporterId,
        subjectUserId: subjectId,
        category: "FRAUD_UPON_CITIZEN",
        body: "Verified report with a decision note the reporter must not see.",
        status: "VERIFIED",
        grade: "IV",
        penalty: -40,
        note,
        decidedBy: subjectId, // any decider id; identity is not exposed either way
        deciderOffice: "ADMIN",
        decidedAt: new Date(),
      },
    });

    const res = await GET(getReq({ token: reporterToken }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(note); // NEVER the decision note
    expect(text).not.toContain(subjectEmail);
    expect(text).not.toContain(subjectId);

    const { filed } = JSON.parse(text) as { filed: Array<Record<string, unknown>> };
    expect(filed).toHaveLength(2);
    for (const row of filed) {
      expect(row.subjectCivicId).toBe(subjectCivicId);
      expect(row).not.toHaveProperty("note");
      expect(row).not.toHaveProperty("penalty");
      expect(row).not.toHaveProperty("body");
    }
    const open = filed.find((r) => r.status === "SUBMITTED")!;
    expect(open.grade).toBeNull();
    expect(open.decidedAt).toBeNull();
    const verified = filed.find((r) => r.status === "VERIFIED")!;
    expect(verified.grade).toBe("IV");
    expect(typeof verified.decidedAt).toBe("string");
  });

  it("the subject sees ONLY VERIFIED charges (with note + penalty) and never the reporter", async () => {
    const seed = (status: string, over: Record<string, unknown> = {}) =>
      prisma.citizenReport.create({
        data: {
          reporterUserId: reporterId,
          subjectUserId: subjectId,
          category: "ATTESTATION_BREACH",
          body: `A ${status} complaint body the subject must not see raw.`,
          status,
          ...over,
        },
      });
    await seed("SUBMITTED");
    await seed("DISMISSED", { decidedAt: new Date(), deciderOffice: "ADMIN" });
    await seed("VERIFIED", {
      grade: "III",
      penalty: -20,
      note: "Breach established by the witness record.",
      decidedAt: new Date(),
      deciderOffice: "PROTECTOR",
      decidedBy: reporterId,
    });

    const res = await GET(getReq({ token: subjectToken }));
    expect(res.status).toBe(200);
    const text = await res.text();
    // The reporter's identity never reaches the subject.
    expect(text).not.toContain(reporterEmail);
    expect(text).not.toContain(reporterId);
    expect(text).not.toContain("reporterUserId");

    const data = JSON.parse(text) as {
      filed: unknown[];
      verifiedAgainstMe: Array<Record<string, unknown>>;
    };
    expect(data.filed).toHaveLength(0);
    expect(data.verifiedAgainstMe).toHaveLength(1); // SUBMITTED + DISMISSED invisible
    expect(data.verifiedAgainstMe[0]).toMatchObject({
      category: "ATTESTATION_BREACH",
      grade: "III",
      penalty: -20,
      note: "Breach established by the witness record.",
    });
  });
});
