import { z } from "zod";
import { CIVIC_OFFICES } from "@/lib/gov/types";

/**
 * Wave 16 — civic office appointment payloads (admin desk). Offices are
 * honours + display only; they grant no auth privilege.
 */

export const assignOfficeSchema = z
  .object({
    userId: z.string().min(1).max(64),
    office: z.enum(CIVIC_OFFICES),
    portfolio: z.string().min(1).max(80).optional(),
    note: z.string().max(280).optional(),
  })
  .strict();

export const revokeOfficeSchema = z
  .object({
    appointmentId: z.string().min(1).max(64),
    note: z.string().max(280).optional(),
  })
  .strict();
