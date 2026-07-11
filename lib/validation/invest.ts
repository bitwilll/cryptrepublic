import { z } from "zod";
import { PROJECT_CATEGORIES } from "@/lib/gov/types";

/**
 * Wave 16 — fundraising + pledge payloads. Money grammar matches the store:
 * decimal string, > 0, <= 10,000,000 $CRYPT, at most 2 decimal places, stored
 * verbatim (never floated). No funds move through the Republic — these are
 * registry rows only.
 */

const COIN_RE = /^(?:\d{1,8})(?:\.\d{1,2})?$/;

export function validCoinAmount(v: string): boolean {
  if (!COIN_RE.test(v)) return false;
  const n = Number(v);
  return n > 0 && n <= 10_000_000;
}

const coinAmount = z
  .string()
  .regex(COIN_RE, "Amount must be a number with at most 2 decimal places.")
  .refine((v) => Number(v) > 0, "Amount must be greater than zero.")
  .refine((v) => Number(v) <= 10_000_000, "Amount cannot exceed 10,000,000 $CRYPT.");

export const createProjectSchema = z
  .object({
    title: z.string().min(4).max(80),
    summary: z.string().min(20).max(280),
    description: z.string().min(40).max(4000),
    category: z.enum(PROJECT_CATEGORIES),
    goalCoin: coinAmount,
    // Checksummed EVM address where direct wallet-to-wallet contributions go
    // (public). Routes MUST re-verify the checksum with viem getAddress.
    treasuryAddress: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 0x… EVM address.")
      .optional(),
  })
  .strict();

export const pledgeSchema = z
  .object({
    projectId: z.string().min(1).max(64),
    amountCoin: coinAmount,
    note: z.string().max(280).optional(),
  })
  .strict();

export const withdrawPledgeSchema = z
  .object({
    projectId: z.string().min(1).max(64),
  })
  .strict();

export const withdrawProjectSchema = z.object({}).strict();
