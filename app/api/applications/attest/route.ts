import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { prisma } from "@/lib/db";
import { attestSchema } from "@/lib/validation/mint";
import { canTransition, type AppStatus } from "@/lib/applications/state";
import { json, badRequest, forbidden } from "@/lib/http/responses";

const SELECT = {
  id: true,
  status: true,
  name: true,
  domicileCity: true,
  hostCountry: true,
  motto: true,
  oathAcceptedAt: true,
  citizenTokenId: true,
  sealTxHash: true,
} as const;

/** POST → set name/domicileCity/hostCountry; status DRAFT|ATTESTED → ATTESTED. */
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
  const parsed = attestSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the attestation fields.");

  const existing = await prisma.citizenshipApplication.findUnique({
    where: { userId },
    select: { status: true },
  });
  const from = (existing?.status as AppStatus | undefined) ?? "DRAFT";
  if (!canTransition(from, "ATTESTED")) {
    return badRequest("Cannot attest from the current application state.");
  }

  const application = await prisma.citizenshipApplication.upsert({
    where: { userId },
    update: { ...parsed.data, status: "ATTESTED" },
    create: { userId, status: "ATTESTED", ...parsed.data },
    select: SELECT,
  });
  return json({ ok: true, application });
}
