// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

const APP = "http://localhost:3000";

function post(body: unknown, opts: { origin?: string; cookieToken?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin) headers.origin = opts.origin;
  if (opts.cookieToken) headers.cookie = `cr_session=${opts.cookieToken}`;
  return new Request(APP + "/api/applications/oath", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const GOOD = { motto: "Recognized in time.", oathAccepted: true };

async function seedUser(status: string): Promise<{ userId: string; token: string }> {
  const user = await prisma.user.create({
    data: {
      email: `oath${Date.now()}${Math.random()}@ex.org`,
      application: { create: { status } },
    },
  });
  const { token } = await createSession(user.id);
  return { userId: user.id, token };
}

describe("POST /api/applications/oath", () => {
  const ids: string[] = [];
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("403 on a foreign origin", async () => {
    const { userId, token } = await seedUser("ATTESTED");
    ids.push(userId);
    const res = await POST(post(GOOD, { origin: "https://evil.example", cookieToken: token }));
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    const res = await POST(post(GOOD, { origin: APP }));
    expect(res.status).toBe(401);
  });

  it("400 when oathAccepted is false", async () => {
    const { userId, token } = await seedUser("ATTESTED");
    ids.push(userId);
    const res = await POST(
      post({ motto: "Hello there", oathAccepted: false }, { origin: APP, cookieToken: token }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects oath from DRAFT (must attest first)", async () => {
    const { userId, token } = await seedUser("DRAFT");
    ids.push(userId);
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }));
    expect(res.status).toBe(400);
  });

  it("happy path sets motto + oathAcceptedAt and status OATH_ACCEPTED", async () => {
    const { userId, token } = await seedUser("ATTESTED");
    ids.push(userId);
    const res = await POST(post(GOOD, { origin: APP, cookieToken: token }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      application: { status: string; motto: string; oathAcceptedAt: string | null };
    };
    expect(body.ok).toBe(true);
    expect(body.application.status).toBe("OATH_ACCEPTED");
    expect(body.application.motto).toBe("Recognized in time.");
    expect(body.application.oathAcceptedAt).toBeTruthy();
  });
});
