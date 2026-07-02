// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import {
  AUDIT_FIELD_ALLOWLIST,
  serializeForAudit,
  writeAudit,
  type AuditTargetType,
} from "./audit";

const ROOT = join(__dirname, "..", "..");
const SECRET_NAME_RE =
  /passwordHash|tokenHash|privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey/i;

const suffix = `${Date.now()}`;
const cliEmail = `audit-cli-${suffix}@ex.org`;
let cliUserId: string | undefined;
const auditTargetIds: string[] = [];

describe("serializeForAudit (allowlist serializer)", () => {
  it("USER: a supplied passwordHash NEVER serializes", () => {
    const out = serializeForAudit("USER", {
      id: "u1",
      email: "a@ex.org",
      passwordHash: "SECRET-ARGON2",
      role: "USER",
    });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(Object.keys(parsed)).not.toContain("passwordHash");
    expect(out).not.toContain("SECRET-ARGON2");
    expect(parsed.email).toBe("a@ex.org");
    expect(parsed.role).toBe("USER");
  });

  it("SESSION: a supplied tokenHash NEVER serializes", () => {
    const out = serializeForAudit("SESSION", {
      id: "s1",
      tokenHash: "SECRET-SHA256",
      userAgent: "vitest",
    });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(Object.keys(parsed)).not.toContain("tokenHash");
    expect(out).not.toContain("SECRET-SHA256");
    expect(parsed.userAgent).toBe("vitest");
  });

  it("APPLICATION: Wave-10 adminApprovedAt/adminApprovedBy serialize (ISO / string), passwordHash NEVER", () => {
    const out = serializeForAudit("APPLICATION", {
      id: "app1",
      adminApprovedAt: new Date(0),
      adminApprovedBy: "u1",
      passwordHash: "SECRET-ARGON2",
    });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.adminApprovedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(parsed.adminApprovedBy).toBe("u1");
    expect(Object.keys(parsed)).not.toContain("passwordHash");
    expect(out).not.toContain("SECRET-ARGON2");
  });

  it("EXPORT (Wave 10): the tiny allowlist serializes kind/rowCount/requestedAt, no secret", () => {
    const out = serializeForAudit("EXPORT", {
      kind: "users",
      rowCount: 3,
      requestedAt: new Date(0),
      passwordHash: "SECRET-ARGON2",
    });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.kind).toBe("users");
    expect(parsed.rowCount).toBe(3);
    expect(parsed.requestedAt).toBe("1970-01-01T00:00:00.000Z");
    expect(Object.keys(parsed)).not.toContain("passwordHash");
    expect(out).not.toContain("SECRET-ARGON2");
  });

  it("ALLOWLIST INVARIANT: no targetType allowlist contains a secret-adjacent name", () => {
    for (const t of Object.keys(AUDIT_FIELD_ALLOWLIST) as AuditTargetType[]) {
      for (const field of AUDIT_FIELD_ALLOWLIST[t]) {
        expect(field, `${t}.${field}`).not.toMatch(SECRET_NAME_RE);
      }
    }
  });

  it("BigInt fields serialize as strings (no JSON.stringify TypeError)", () => {
    const out = serializeForAudit("ASSET", {
      id: "a1",
      ref: "RE-001",
      valueUsd: 28_400_000n,
      annualYieldUsd: 1_363_200n,
    });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.valueUsd).toBe("28400000");
    expect(parsed.annualYieldUsd).toBe("1363200");
  });

  it("Date fields serialize as ISO strings", () => {
    const when = new Date("2026-07-02T12:00:00.000Z");
    const out = serializeForAudit("USER", { id: "u1", suspendedAt: when });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.suspendedAt).toBe("2026-07-02T12:00:00.000Z");
  });

  it("unknown targetType throws", () => {
    expect(() => serializeForAudit("NOPE" as AuditTargetType, { id: "x" })).toThrow(
      /unknown audit targetType/i,
    );
  });
});

describe("writeAudit (transactional)", () => {
  it("persists a row via the SAME transaction client, with parseable before/after", async () => {
    const targetId = `audit-target-${suffix}`;
    auditTargetIds.push(targetId);
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorUserId: null,
        actorLabel: "cli",
        action: "flag.upsert",
        targetType: "FLAG",
        targetId,
        before: { key: targetId, enabled: false, tokenHash: "SECRET" },
        after: { key: targetId, enabled: true },
      });
    });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { targetId } });
    expect(row.actorLabel).toBe("cli");
    expect(row.action).toBe("flag.upsert");
    const before = JSON.parse(row.beforeJson!) as Record<string, unknown>;
    const after = JSON.parse(row.afterJson!) as Record<string, unknown>;
    expect(before.enabled).toBe(false);
    expect(after.enabled).toBe(true);
    // FLAG's allowlist has no tokenHash — the stray key is dropped, not stored.
    expect(Object.keys(before)).not.toContain("tokenHash");
  });

  it("omitted before/after store as null (create/delete shapes)", async () => {
    const targetId = `audit-null-${suffix}`;
    auditTargetIds.push(targetId);
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorUserId: null,
        actorLabel: "cli",
        action: "flag.delete",
        targetType: "FLAG",
        targetId,
        before: { key: targetId, enabled: true },
      });
    });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { targetId } });
    expect(row.beforeJson).not.toBeNull();
    expect(row.afterJson).toBeNull();
  });
});

describe("grant-admin CLI smoke (REAL tsx subprocess)", () => {
  // This is the ONLY gate that can catch a `server-only`/module-resolution
  // regression in the CLI's import graph: vitest ALIASES `server-only` to
  // test/empty-module.ts (vitest.config.ts), so every in-process test — incl.
  // the direct setAdminRole calls in test/admin-guard.test.ts — stays green
  // even when the real CLI is dead under tsx (server-only is NOT an installed
  // package; Next vendors it at build time). Do not replace this with an import.
  it("pnpm admin:grant executes under tsx: exit 0, role flipped, audit row written", async () => {
    const user = await prisma.user.create({ data: { email: cliEmail } });
    cliUserId = user.id;

    const stdout = execFileSync("pnpm", ["admin:grant", cliEmail], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(stdout).toContain("ADMIN");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.role).toBe("ADMIN");

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: user.id, action: "user.role.grant_admin" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorLabel).toBe("cli");
    expect(audit!.beforeJson).not.toContain("passwordHash");
    expect(audit!.afterJson).not.toContain("passwordHash");
  }, 90_000);
});

afterAll(async () => {
  if (cliUserId) {
    await prisma.auditLog.deleteMany({ where: { targetId: cliUserId } });
    await prisma.user.deleteMany({ where: { id: cliUserId } });
  }
  if (auditTargetIds.length) {
    await prisma.auditLog.deleteMany({ where: { targetId: { in: auditTargetIds } } });
  }
  await prisma.$disconnect();
});
