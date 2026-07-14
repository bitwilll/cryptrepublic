import "server-only";
import { prisma } from "@/lib/db";
import {
  FLAG_DEFAULTS,
  flagValue,
  registrationPolicyFromFlags,
  type RegistrationPolicy,
} from "./defaults";

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

/** The Cabinet's registration policy, resolved from the two declared flags.
 *  Degrades to OPEN exactly like every other flag read — a DB failure must
 *  never lock the Republic's door by accident. */
export async function getRegistrationPolicyServer(): Promise<RegistrationPolicy> {
  const [open, referralOnly] = await Promise.all([
    flagEnabledServer("registration_open"),
    flagEnabledServer("registration_referral_only"),
  ]);
  return registrationPolicyFromFlags(open, referralOnly);
}
