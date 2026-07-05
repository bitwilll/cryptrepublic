// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/auth/ratelimit";
import { POST as startPost } from "./route";

const APP = "http://localhost:3000";
const created: string[] = [];

function req(opts: { origin?: string | null } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const origin = opts.origin === undefined ? APP : opts.origin;
  if (origin) headers.origin = origin;
  return new Request(`${APP}/api/auth/qr/start`, { method: "POST", headers });
}

describe("POST /api/auth/qr/start", () => {
  beforeEach(() => __resetRateLimit());
  afterAll(async () => {
    await prisma.walletLoginChallenge.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it("403 on a foreign origin", async () => {
    expect((await startPost(req({ origin: "https://evil.example" }))).status).toBe(403);
  });

  it("creates a pending challenge and returns the public QR fields", async () => {
    const res = await startPost(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.challengeId).toBe("string");
    expect(typeof body.nonce).toBe("string");
    expect(body.matchCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(body.domain).toBe("localhost:3000");
    expect(body.uri).toBe(APP);
    expect(body.chainId).toBe(84532);
    created.push(body.challengeId);
    const row = await prisma.walletLoginChallenge.findUnique({ where: { id: body.challengeId } });
    expect(row?.status).toBe("pending");
    expect(row?.nonce).toBe(body.nonce);
    // Public payload only — the response never carries a key/seed.
    expect(JSON.stringify(body)).not.toMatch(/seed|mnemonic|private/i);
  });
});
