// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

const APP = "http://localhost:3000";
const ids: string[] = [];
const TXHASH = "0x" + "ab".repeat(32);

function post(body: unknown, opts: { origin?: string; cookieToken?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin) headers.origin = opts.origin;
  if (opts.cookieToken) headers.cookie = `cr_session=${opts.cookieToken}`;
  return new Request(APP + "/api/applications/seal/confirm", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function seed(status: string): Promise<{ userId: string; token: string }> {
  const user = await prisma.user.create({
    data: {
      email: `seal${Date.now()}${Math.random()}@ex.org`,
      application: { create: { status } },
    },
  });
  const { token } = await createSession(user.id);
  ids.push(user.id);
  return { userId: user.id, token };
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("POST /api/applications/seal/confirm", () => {
  it("403 on a foreign origin", async () => {
    const { token } = await seed("WITNESSED");
    const res = await POST(
      post(
        { txHash: TXHASH, tokenId: "5" },
        { origin: "https://evil.example", cookieToken: token },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("401 without a session", async () => {
    const res = await POST(post({ txHash: TXHASH, tokenId: "5" }, { origin: APP }));
    expect(res.status).toBe(401);
  });

  it("400 on invalid body", async () => {
    const { token } = await seed("WITNESSED");
    const res = await POST(
      post({ txHash: "nothex", tokenId: "5" }, { origin: APP, cookieToken: token }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects sealing from a pre-WITNESSED state", async () => {
    const { token } = await seed("OATH_ACCEPTED");
    const res = await POST(
      post({ txHash: TXHASH, tokenId: "5" }, { origin: APP, cookieToken: token }),
    );
    expect(res.status).toBe(400);
  });

  it("records txHash/tokenId/sealedAt and status SEALED", async () => {
    const { token, userId } = await seed("WITNESSED");
    const res = await POST(
      post({ txHash: TXHASH, tokenId: "48393" }, { origin: APP, cookieToken: token }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      application: {
        status: string;
        sealTxHash: string;
        citizenTokenId: string;
        sealedAt: string | null;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.application.status).toBe("SEALED");
    expect(body.application.sealTxHash).toBe(TXHASH);
    expect(body.application.citizenTokenId).toBe("48393");
    expect(body.application.sealedAt).toBeTruthy();

    const app = await prisma.citizenshipApplication.findUnique({ where: { userId } });
    expect(app?.status).toBe("SEALED");
  });
});
