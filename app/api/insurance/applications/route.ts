import "server-only";
import type { InsuranceApplication } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { insuranceApplySchema } from "@/lib/validation/estate";

/**
 * /api/insurance/applications (Wave 15 B) — the Insurance Office registry.
 *
 * A REGISTRY of cover applications and their review state only: no premiums
 * are collected, no payouts are made, and no funds ever move through the
 * Republic. POST registers an application (max 3 non-DECLINED per product per
 * citizen, enforced inside the create transaction); GET lists the caller's
 * own applications, newest first.
 */

const MAX_OPEN_PER_PRODUCT = 3;

/** valueUsd is a BigInt column — JSON.stringify throws on BigInt, so emit a string. */
function serialize(a: InsuranceApplication) {
  return { ...a, valueUsd: a.valueUsd === null ? null : a.valueUsd.toString() };
}

export async function GET(req: Request): Promise<Response> {
  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const applications = await prisma.insuranceApplication.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return json({ applications: applications.map(serialize) });
}

export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return forbidden();

  let userId: string;
  try {
    ({
      user: { id: userId },
    } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = insuranceApplySchema.safeParse(body);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom");
    return badRequest(custom?.message ?? "Please check the application fields.");
  }
  const { product, coverageNote, valueUsd } = parsed.data;

  let created: InsuranceApplication;
  try {
    created = await prisma.$transaction(async (tx) => {
      // Cap re-checked INSIDE the transaction so racing submissions cannot
      // exceed it (SQLite serializes; Postgres re-counts within the tx).
      const open = await tx.insuranceApplication.count({
        where: { userId, product, status: { not: "DECLINED" } },
      });
      if (open >= MAX_OPEN_PER_PRODUCT) throw new Error("LIMIT");
      return tx.insuranceApplication.create({
        data: {
          userId,
          product,
          coverageNote,
          valueUsd: valueUsd === undefined ? null : BigInt(valueUsd),
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "LIMIT") {
      return badRequest(
        "You already have three applications on file for this product. Await their review.",
      );
    }
    throw e;
  }

  return json({ ok: true, application: serialize(created) });
}
