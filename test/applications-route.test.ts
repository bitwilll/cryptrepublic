// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { GET as getApp, POST as postApp } from "@/app/api/applications/route";

const APP = "http://localhost:3000";
let userId: string;
let token: string;

function authedGet(cookieToken?: string) {
  return new Request(APP + "/api/applications", {
    method: "GET",
    headers: cookieToken ? { cookie: `cr_session=${cookieToken}` } : {},
  });
}

function authedPost(body: unknown, opts: { origin?: string; cookieToken?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin) headers.origin = opts.origin;
  if (opts.cookieToken) headers.cookie = `cr_session=${opts.cookieToken}`;
  return new Request(APP + "/api/applications", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("applications route", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `app${Date.now()}@app-route.example`,
        passwordHash: await hashPassword("x".repeat(12)),
        application: { create: { status: "DRAFT" } },
      },
    });
    userId = user.id;
    ({ token } = await createSession(userId));
  });

  it("GET with the session cookie returns the DRAFT application", async () => {
    const res = await getApp(authedGet(token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { application: { status: string } | null };
    expect(body.application?.status).toBe("DRAFT");
  });

  it("GET without a cookie is 401", async () => {
    const res = await getApp(authedGet());
    expect(res.status).toBe(401);
  });

  it("POST valid body persists the declared fields", async () => {
    const res = await postApp(
      authedPost(
        { name: "Ada L.", domicileCity: "Lagos", hostCountry: "Nigeria", motto: "Compute freely" },
        { origin: APP, cookieToken: token },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      application: {
        name: string;
        domicileCity: string;
        hostCountry: string;
        motto: string | null;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.application.name).toBe("Ada L.");
    expect(body.application.domicileCity).toBe("Lagos");
    expect(body.application.hostCountry).toBe("Nigeria");
    expect(body.application.motto).toBe("Compute freely");
  });

  it("POST with an unknown field is 400", async () => {
    const res = await postApp(
      authedPost(
        { name: "Ada", domicileCity: "Lagos", hostCountry: "NG", role: "ADMIN" },
        { origin: APP, cookieToken: token },
      ),
    );
    expect(res.status).toBe(400);
  });

  it("POST without a cookie is 401", async () => {
    const res = await postApp(
      authedPost({ name: "Ada", domicileCity: "Lagos", hostCountry: "NG" }, { origin: APP }),
    );
    expect(res.status).toBe(401);
  });

  it("POST from a foreign origin is 403", async () => {
    const res = await postApp(
      authedPost(
        { name: "Ada", domicileCity: "Lagos", hostCountry: "NG" },
        { origin: "https://evil.example", cookieToken: token },
      ),
    );
    expect(res.status).toBe(403);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
});
