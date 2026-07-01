import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { nameHashOf } from "@/lib/passport/attestation";
import { json } from "@/lib/http/responses";

/**
 * GET → the collected witness signatures for the user's application, PLUS the
 * bound `{ applicant, nameHash }`, so the client can rebuild the EXACT
 * `attestations[]` (each `{ applicant, nameHash, nonce, deadline }` from the
 * STORED per-sig nonce/deadline) and 1:1 `signatures[]` for `encodeMintCall` at
 * seal time — WITHOUT re-collecting sigs. The reconstruction MUST use the STORED
 * nonce/deadline, not a fresh read.
 */
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

  const application = await prisma.citizenshipApplication.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      applicantAddress: true,
      witnessNonce: true,
      witnessDeadline: true,
      witnessSignatures: {
        select: { witnessAddress: true, signature: true, nonce: true, deadline: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!application) {
    return json({ applicant: null, nameHash: null, signatures: [] });
  }

  return json({
    applicant: application.applicantAddress,
    nameHash: application.name ? nameHashOf(application.name) : null,
    nonce: application.witnessNonce,
    deadline: application.witnessDeadline,
    signatures: application.witnessSignatures,
  });
}
