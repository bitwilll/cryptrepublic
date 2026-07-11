import { z } from "zod";
import { CONNECTION_KINDS } from "@/lib/gov/types";
import { CIVIC_ID_RE } from "@/lib/identity/civicId";

/** Wave 17 — connections, conversations, messages. */

export const connectionRequestSchema = z
  .object({
    civicId: z.string().regex(CIVIC_ID_RE, "That is not a valid Civic ID (CR-XXXX-XXXX)."),
    kind: z.enum(CONNECTION_KINDS),
    greeting: z.string().max(280).optional(),
  })
  .strict();

export const connectionRespondSchema = z
  .object({
    connectionId: z.string().min(1).max(64),
    action: z.enum(["accept", "decline", "remove"]),
  })
  .strict();

export const messageSchema = z
  .object({
    conversationId: z.string().min(1).max(64),
    body: z.string().min(1).max(2000),
  })
  .strict();

export const groupCreateSchema = z
  .object({
    title: z.string().min(2).max(60),
    memberCivicIds: z.array(z.string().regex(CIVIC_ID_RE)).min(1).max(24),
  })
  .strict();

export const groupAddMemberSchema = z
  .object({
    conversationId: z.string().min(1).max(64),
    civicId: z.string().regex(CIVIC_ID_RE),
  })
  .strict();
