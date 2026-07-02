import "server-only";
import { prisma } from "@/lib/db";
import { FLAG_DEFAULTS, flagValue } from "./defaults";

/**
 * Server-side flag read (Server Components / route handlers). NEVER throws:
 * a missing row resolves to the DECLARED default and a DB failure degrades to
 * the same default (undeclared keys are OFF) — flags must never take a page
 * down (constraint #8).
 */
export async function flagEnabledServer(key: string): Promise<boolean> {
  try {
    const row = await prisma.featureFlag.findUnique({ where: { key } });
    return flagValue(key, row);
  } catch {
    return FLAG_DEFAULTS[key] ?? false;
  }
}
