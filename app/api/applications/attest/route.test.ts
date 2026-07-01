// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

const APP = "http://localhost:3000";
let userId: string;
let token: string;

function post(body: unknown, opts: { origin?: string; cookieToken?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin) headers.origin = opts.origin;
  if (opts.cookieToken) headers.cookie = `cr_session=${opts.cookieToken}`;
  return new Request(APP + "/api/applications/attest", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const GOOD = { name: "A. Nakadai", domicileCity: "Lisbon", hostCountry: "Portugal" };

describe("POST /api/applications/attest", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `attest${Date.now()}@ex.org`, application: { create: { status: "DRAFT" } } },
    });
    userId = user.id;
    ({ token } = await createSession(userId));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("403 on a foreign origin", async () => {
    const res = await POST(post(GOOD, { origin: "https://evil.example", cookieToken: token }));
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    const res = await POST(post(GOOD, { origin: APP }));
    expect(res.status).toBe(401);
  });

  it("400 on invalid body", async () => {
    const res = await POST(post({ name: "" }, { origin: APP, cookieToken: token }));
    expect(res.status).toBe(400);
  });

  it("happy path sets fields and status ATTESTED", async () => {
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      application: { status: string; name: string; domicileCity: string; hostCountry: string };
    };
    expect(body.ok).toBe(true);
    expect(body.application.status).toBe("ATTESTED");
    expect(body.application.name).toBe("A. Nakadai");
    expect(body.application.domicileCity).toBe("Lisbon");
    expect(body.application.hostCountry).toBe("Portugal");
  });

  it("re-attest from ATTESTED is idempotent (still ATTESTED)", async () => {
    const res = await POST(
      post({ ...GOOD, name: "A. Nakadai II" }, { origin: APP, cookieToken: token }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { application: { status: string; name: string } };
    expect(body.application.status).toBe("ATTESTED");
    expect(body.application.name).toBe("A. Nakadai II");
  });
});
