import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { json, badRequest, forbidden } from "@/lib/http/responses";
import { connectionRequestSchema } from "@/lib/validation/community";
import { getOrAssignCivicId, normalizeCivicId } from "@/lib/identity/civicId";
import { citizenRefMap } from "../lib";

/**
 * GET /api/community/connections — the caller's connection ledger in three
 * registers: incoming PENDING requests addressed to me (requester shown with
 * display name + Civic ID — they chose to reach me), my outgoing PENDING
 * (addressee shown by CIVIC ID ONLY — no display name until they accept!),
 * and ACCEPTED connections (peer { civicId, display }).
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

  const rows = await prisma.citizenConnection.findMany({
    where: {
      OR: [
        { addresseeUserId: userId, status: "PENDING" },
        { requesterUserId: userId, status: "PENDING" },
        { requesterUserId: userId, status: "ACCEPTED" },
        { addresseeUserId: userId, status: "ACCEPTED" },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  // Refs for requesters of incoming + both parties of accepted. Outgoing
  // addressees get their civicId ONLY (privacy: no name before acceptance).
  const refIds = rows
    .filter((r) => r.status === "ACCEPTED" || r.addresseeUserId === userId)
    .flatMap((r) => [r.requesterUserId, r.addresseeUserId]);
  const refs = await citizenRefMap(refIds);
  const outgoingAddressees = await citizenRefMap(
    rows
      .filter((r) => r.status === "PENDING" && r.requesterUserId === userId)
      .map((r) => r.addresseeUserId),
  );

  const incoming = rows
    .filter((r) => r.status === "PENDING" && r.addresseeUserId === userId)
    .map((r) => ({
      connectionId: r.id,
      kind: r.kind,
      greeting: r.greeting,
      requester: {
        civicId: refs.get(r.requesterUserId)?.civicId ?? "",
        display: refs.get(r.requesterUserId)?.display ?? "Applicant",
      },
      createdAt: r.createdAt.toISOString(),
    }));

  const outgoing = rows
    .filter((r) => r.status === "PENDING" && r.requesterUserId === userId)
    .map((r) => ({
      connectionId: r.id,
      kind: r.kind,
      // Civic ID ONLY — the addressee's display name stays private until they accept.
      civicId: outgoingAddressees.get(r.addresseeUserId)?.civicId ?? "",
      createdAt: r.createdAt.toISOString(),
    }));

  const accepted = rows
    .filter((r) => r.status === "ACCEPTED")
    .map((r) => {
      const peerId = r.requesterUserId === userId ? r.addresseeUserId : r.requesterUserId;
      return {
        connectionId: r.id,
        kind: r.kind,
        peer: {
          civicId: refs.get(peerId)?.civicId ?? "",
          display: refs.get(peerId)?.display ?? "Applicant",
        },
        since: (r.respondedAt ?? r.createdAt).toISOString(),
      };
    });

  return json({ incoming, outgoing, accepted });
}

/**
 * POST /api/community/connections — file a friend/family request addressed by
 * the target's ANONYMOUS Civic ID. One row per pair (either direction):
 * PENDING → 409, ACCEPTED → 409, DECLINED/REMOVED → the OLD row is re-armed
 * back to PENDING with the new kind/greeting (requester swapped when needed).
 * The response NEVER reveals whether/who holds the ID beyond "filed" — no
 * display name, no enumeration surface beyond the 404.
 */
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
  const parsed = connectionRequestSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Bad request.");

  const civicId = normalizeCivicId(parsed.data.civicId);
  if (!civicId) return badRequest("That is not a valid Civic ID (CR-XXXX-XXXX).");

  const target = await prisma.user.findUnique({ where: { civicId }, select: { id: true } });
  if (!target) return json({ error: "No citizen holds that Civic ID." }, { status: 404 });
  if (target.id === userId) {
    return badRequest("That is your own Civic ID — you cannot connect with yourself.");
  }

  // Make sure the requester holds a Civic ID too: the addressee's incoming
  // list shows it alongside the display name.
  await getOrAssignCivicId(userId);

  const greeting = parsed.data.greeting?.trim() || null;

  const existing = await prisma.citizenConnection.findFirst({
    where: {
      OR: [
        { requesterUserId: userId, addresseeUserId: target.id },
        { requesterUserId: target.id, addresseeUserId: userId },
      ],
    },
  });

  if (existing) {
    if (existing.status === "PENDING") {
      return json(
        { error: "A request between you and that citizen is already awaiting response." },
        { status: 409 },
      );
    }
    if (existing.status === "ACCEPTED") {
      return json({ error: "You are already connected with that citizen." }, { status: 409 });
    }
    // DECLINED / REMOVED — re-request by re-arming the SAME row (one row per
    // pair, either direction), with me as requester.
    await prisma.citizenConnection.update({
      where: { id: existing.id },
      data: {
        requesterUserId: userId,
        addresseeUserId: target.id,
        kind: parsed.data.kind,
        greeting,
        status: "PENDING",
        createdAt: new Date(),
        respondedAt: null,
      },
    });
    return json({ ok: true, filed: true });
  }

  await prisma.citizenConnection.create({
    data: {
      requesterUserId: userId,
      addresseeUserId: target.id,
      kind: parsed.data.kind,
      greeting,
    },
  });

  return json({ ok: true, filed: true });
}
