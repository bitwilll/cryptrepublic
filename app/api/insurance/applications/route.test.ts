// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { GET, POST } from "./route";

/**
 * /api/insurance/applications (Wave 15 B). Real prisma. A REGISTRY only — the
 * route never touches funds. Asserts guards, zod bounds (ASSET requires
 * valueUsd), the 3-non-DECLINED-per-product cap (DECLINED rows do NOT count;
 * the other product is unaffected), BigInt valueUsd round-trips as a string,
 * and GET returns ONLY the caller's rows newest-first.
 */

const APP = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let userId: string;
let otherId: string;
let token: string;

const NOTE = "Cover my apartment against fire and flood damage.";

function post(body: unknown, opts: { token?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  headers.origin = opts.origin ?? APP;
  if (opts.token) headers.cookie = `cr_session=${opts.token}`;
  return new Request(APP + "/api/insurance/applications", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
function get(opts: { token?: string } = {}) {
  return new Request(APP + "/api/insurance/applications", {
    method: "GET",
    headers: opts.token ? { cookie: `cr_session=${opts.token}` } : {},
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `ins-a-${suffix}@w15ins.example` } });
  const other = await prisma.user.create({ data: { email: `ins-b-${suffix}@w15ins.example` } });
  userId = user.id;
  otherId = other.id;
  ({ token } = await createSession(userId));
});

beforeEach(async () => {
  await prisma.insuranceApplication.deleteMany({ where: { userId: { in: [userId, otherId] } } });
});

afterAll(async () => {
  await prisma.insuranceApplication.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await prisma.$disconnect();
});

describe("POST /api/insurance/applications", () => {
  it("403 on a foreign origin; 401 without a session", async () => {
    const body = { product: "HEALTH", coverageNote: NOTE };
    expect((await POST(post(body, { token, origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(post(body))).status).toBe(401);
  });

  it("400 on bad bodies (product / bounds / unknown key)", async () => {
    const bad = [
      { product: "LIFE", coverageNote: NOTE },
      { product: "HEALTH", coverageNote: "too short" },
      { product: "ASSET", coverageNote: NOTE, valueUsd: 0 },
      { product: "ASSET", coverageNote: NOTE, valueUsd: 100_000_001 },
      { product: "ASSET", coverageNote: NOTE, valueUsd: 12.5 },
      { product: "HEALTH", coverageNote: NOTE, zz: 1 },
    ];
    for (const body of bad) expect((await POST(post(body, { token }))).status).toBe(400);
  });

  it("400 when an ASSET application declares no value (with the field message)", async () => {
    const res = await POST(post({ product: "ASSET", coverageNote: NOTE }, { token }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/value/i);
    expect(await prisma.insuranceApplication.count({ where: { userId } })).toBe(0);
  });

  it("registers ASSET cover with a BigInt-stored value, serialized as a string", async () => {
    const res = await POST(
      post({ product: "ASSET", coverageNote: NOTE, valueUsd: 99_000_000 }, { token }),
    );
    expect(res.status).toBe(200);
    const { application } = (await res.json()) as {
      application: { valueUsd: string; status: string; product: string };
    };
    expect(application.valueUsd).toBe("99000000");
    expect(application.status).toBe("SUBMITTED");
    const row = await prisma.insuranceApplication.findFirstOrThrow({ where: { userId } });
    expect(row.valueUsd).toBe(99_000_000n);
  });

  it("registers HEALTH cover without a value (valueUsd null)", async () => {
    const res = await POST(post({ product: "HEALTH", coverageNote: NOTE }, { token }));
    expect(res.status).toBe(200);
    const { application } = (await res.json()) as { application: { valueUsd: string | null } };
    expect(application.valueUsd).toBeNull();
  });

  it("caps at 3 non-DECLINED applications per product; DECLINED does not count; other product unaffected", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await POST(post({ product: "HEALTH", coverageNote: NOTE }, { token }))).status).toBe(
        200,
      );
    }
    const fourth = await POST(post({ product: "HEALTH", coverageNote: NOTE }, { token }));
    expect(fourth.status).toBe(400);
    expect((await fourth.json()).error).toMatch(/three applications/i);

    // the OTHER product still accepts
    expect(
      (await POST(post({ product: "ASSET", coverageNote: NOTE, valueUsd: 1000 }, { token })))
        .status,
    ).toBe(200);

    // a DECLINED application frees a slot
    const one = await prisma.insuranceApplication.findFirstOrThrow({
      where: { userId, product: "HEALTH" },
    });
    await prisma.insuranceApplication.update({
      where: { id: one.id },
      data: { status: "DECLINED" },
    });
    expect((await POST(post({ product: "HEALTH", coverageNote: NOTE }, { token }))).status).toBe(
      200,
    );
  });
});

describe("GET /api/insurance/applications", () => {
  it("401 without a session", async () => {
    expect((await GET(get())).status).toBe(401);
  });

  it("returns ONLY the caller's applications, newest first", async () => {
    await POST(post({ product: "HEALTH", coverageNote: `${NOTE} first` }, { token }));
    await new Promise((r) => setTimeout(r, 10)); // createdAt has ms resolution
    await POST(post({ product: "ASSET", coverageNote: `${NOTE} second`, valueUsd: 5 }, { token }));
    await prisma.insuranceApplication.create({
      data: { userId: otherId, product: "HEALTH", coverageNote: "someone else's cover note" },
    });

    const res = await GET(get({ token }));
    expect(res.status).toBe(200);
    const { applications } = (await res.json()) as {
      applications: Array<{ coverageNote: string; valueUsd: string | null }>;
    };
    expect(applications).toHaveLength(2);
    expect(applications[0]!.coverageNote).toMatch(/second/);
    expect(applications[0]!.valueUsd).toBe("5");
    expect(applications[1]!.coverageNote).toMatch(/first/);
    expect(applications.some((a) => a.coverageNote.includes("someone else"))).toBe(false);
  });
});
