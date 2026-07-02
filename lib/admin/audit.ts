/**
 * Admin audit helper (Wave 9). EVERY admin mutation writes its audit row IN THE
 * SAME prisma.$transaction as the mutation, via writeAudit(tx, …). Snapshots
 * pass serializeForAudit's per-targetType field ALLOWLIST — passwordHash /
 * tokenHash (or any secret-adjacent column) can NEVER appear in beforeJson /
 * afterJson, because only allowlisted keys are ever picked.
 *
 * ENVIRONMENT-NEUTRAL — deliberately NO `import "server-only"`. This module is
 * imported by Next route handlers AND by scripts/grant-admin.ts under tsx.
 * `server-only` is NOT an installed package in this repo (Next vendors it at
 * build time), so marking this file would crash the ONLY admin-bootstrap path
 * (`pnpm admin:grant`) at import time — while every vitest suite stayed green
 * (vitest aliases server-only to an empty module). The subprocess smoke test in
 * audit.test.ts guards exactly this. It takes the transaction client as a
 * parameter, imports only Prisma TYPES, and holds no secrets or Next-only APIs.
 *
 * Action-name convention (dot-namespaced; the audit viewer filters on it):
 *   user.suspend | user.unsuspend | user.kyc.set | user.sessions.revoke
 *   user.role.grant_admin | user.role.revoke_admin           (cli only)
 *   application.review
 *   content.asset.create|update|delete   content.embassy.*   content.census.*
 *   content.allocation.*                 content.constitution.*
 *   content.proposal.update              content.comment.delete
 *   flag.upsert | flag.delete
 *
 * SCOPE (recorded, addendum #8): the audit trail covers SERVER mutations only.
 * Composing/exporting PREPARED calldata (lib/admin/prepare.ts) is pure
 * client-side and writes no AuditLog row — the user's Safe review/queue is the
 * audit surface for prepared transactions.
 */
import type { Prisma } from "@prisma/client";

export type AuditTargetType =
  | "USER"
  | "SESSION"
  | "APPLICATION"
  | "ASSET"
  | "EMBASSY"
  | "CENSUS"
  | "ALLOCATION"
  | "CONSTITUTION"
  | "PROPOSAL_CONTENT"
  | "COMMENT"
  | "FLAG"
  | "EXPORT";

/** Per-targetType field ALLOWLIST — the ONLY keys serializeForAudit will emit.
 *  INVARIANT (test-enforced): no allowlist ever contains passwordHash, tokenHash,
 *  or any /privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey/i name. */
export const AUDIT_FIELD_ALLOWLIST: Record<AuditTargetType, readonly string[]> = {
  USER: [
    "id",
    "email",
    "name",
    "role",
    "kycStatus",
    "suspendedAt",
    "lockedUntil",
    "failedLoginCount",
    "createdAt",
    "updatedAt",
  ],
  SESSION: ["id", "userId", "userAgent", "ipHash", "createdAt", "expiresAt"], // NEVER tokenHash
  APPLICATION: [
    "id",
    "userId",
    "status",
    "name",
    "domicileCity",
    "hostCountry",
    "motto",
    "kycStatus",
    "reviewNote",
    "applicantAddress",
    "sealTxHash",
    "citizenTokenId",
    "sealedAt",
    "adminApprovedAt", // Wave 10 — off-chain admin-mint approval intent (never chain truth)
    "adminApprovedBy", // Wave 10 — the approving admin's userId (public)
    "createdAt",
    "updatedAt",
  ],
  ASSET: [
    "id",
    "ref",
    "kind",
    "name",
    "location",
    "valueUsd",
    "yieldBps",
    "annualYieldUsd",
    "status",
    "acquiredAt",
  ],
  EMBASSY: ["code", "name", "neighborhood", "hours", "foundedAt", "brandColor", "city", "country"],
  CENSUS: ["code", "name", "lat", "long", "hasEmbassy", "seededCount"],
  ALLOCATION: ["id", "bucket", "label", "targetBps", "color"],
  CONSTITUTION: ["id", "key", "title", "body", "citation"],
  PROPOSAL_CONTENT: [
    "id",
    "chainId",
    "proposalId",
    "title",
    "tag",
    "body",
    "descriptionHash",
    "createdAt",
  ],
  COMMENT: [
    "id",
    "proposalContentId",
    "authorAddress",
    "citizenTokenId",
    "body",
    "upvotes",
    "createdAt",
  ],
  FLAG: ["key", "enabled", "description", "updatedAt"],
  // Wave 10 — CSV report exports (a READ, audited before the body returns). Tiny
  // allowlist: the export KIND + row count + timestamp; never a per-row secret.
  EXPORT: ["kind", "rowCount", "requestedAt"],
};

function auditValue(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString(); // BigInt-safe (JSON.stringify throws on BigInt)
  if (v instanceof Date) return v.toISOString();
  return v;
}

/** Picks ONLY allowlisted keys; BigInt → string, Date → ISO; unknown targetType THROWS. */
export function serializeForAudit(targetType: AuditTargetType, record: unknown): string {
  const allowlist = AUDIT_FIELD_ALLOWLIST[targetType];
  if (!allowlist) {
    throw new Error(`serializeForAudit: unknown audit targetType "${String(targetType)}"`);
  }
  const source = (record ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of allowlist) {
    if (key in source) out[key] = auditValue(source[key]);
  }
  return JSON.stringify(out);
}

export interface AuditEntry {
  actorUserId: string | null; // null == CLI
  actorLabel: string; // "admin:<email>" | "cli"
  action: string; // dot-namespaced (see header convention)
  targetType: AuditTargetType;
  targetId: string;
  before?: unknown; // raw record — serialized through the allowlist
  after?: unknown;
  userAgent?: string | null;
}

/** Writes the audit row via the SAME transaction client as the mutation. */
export async function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      actorLabel: entry.actorLabel,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      beforeJson:
        entry.before === undefined ? null : serializeForAudit(entry.targetType, entry.before),
      afterJson:
        entry.after === undefined ? null : serializeForAudit(entry.targetType, entry.after),
      userAgent: entry.userAgent ?? null,
    },
  });
}
