/**
 * ADMIN BOOTSTRAP CLI (Wave 9) — `pnpm admin:grant <email> [--revoke]`
 *
 * WHAT: flips a user's `role` between USER and ADMIN, writing the audit row in
 * the SAME transaction (actorLabel "cli", actorUserId null).
 *
 * WHY A CLI: there is deliberately NO API path that sets or changes `role` — not
 * even for an admin (no self/peer promotion in v1). The ONLY way to mint an
 * admin is this script, run by an operator with direct DB access.
 *
 * HOW: `pnpm admin:grant ops@example.org` grants; `--revoke` demotes back to
 * USER. Idempotent: re-granting an existing ADMIN (or re-revoking a USER)
 * short-circuits with a message and writes NO duplicate audit row (recorded
 * decision — keeps the audit trail meaningful).
 *
 * ENVIRONMENT: runs under tsx like `prisma/seed.ts` (PrismaClient resolves
 * DATABASE_URL from .env itself). EVERY import in this file's graph must stay
 * environment-NEUTRAL — `server-only` is NOT an installed package (Next vendors
 * it at build time), so any `import "server-only"` in the graph kills this CLI
 * at import time under tsx while vitest (which aliases server-only) stays green.
 * The A2 subprocess smoke test in lib/admin/audit.test.ts guards this.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { normalizeEmail } from "../lib/validation/auth";
import { writeAudit } from "../lib/admin/audit";
import type { UserRole } from "../lib/auth/types";

const prisma = new PrismaClient();

/** Core, exported so unit tests call it directly (no process spawn). */
export async function setAdminRole(
  email: string,
  opts?: { revoke?: boolean },
): Promise<{ userId: string; role: UserRole }> {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    throw new Error(`No user with email ${normalized}`);
  }

  const targetRole: UserRole = opts?.revoke ? "USER" : "ADMIN";
  if (user.role === targetRole) {
    // Idempotent short-circuit — no duplicate audit noise (see header).
    console.log(`grant-admin: ${normalized} already has role ${targetRole} — no change.`);
    return { userId: user.id, role: targetRole };
  }

  await prisma.$transaction(async (tx) => {
    const after = await tx.user.update({ where: { id: user.id }, data: { role: targetRole } });
    // writeAudit serializes through the USER field allowlist — passwordHash can never appear.
    await writeAudit(tx, {
      actorUserId: null,
      actorLabel: "cli",
      action: opts?.revoke ? "user.role.revoke_admin" : "user.role.grant_admin",
      targetType: "USER",
      targetId: user.id,
      before: user,
      after,
    });
  });

  console.log(`grant-admin: ${normalized} role ${user.role} -> ${targetRole} (audited as "cli").`);
  return { userId: user.id, role: targetRole };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = args.find((a) => !a.startsWith("--"));
  if (!email) {
    console.error("Usage: pnpm admin:grant <email> [--revoke]");
    process.exitCode = 1;
    return;
  }
  try {
    await setAdminRole(email, { revoke });
  } catch (e) {
    console.error(`grant-admin: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Run ONLY when executed directly (tsx CLI), never on vitest import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
