import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { prisma } from "@/lib/db";
import { oathSchema } from "@/lib/validation/mint";
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
} as const;

/** POST → set motto + oathAcceptedAt; status ATTESTED → OATH_ACCEPTED. */
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
  const parsed = oathSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please accept the oath and provide a motto.");

  const existing = await prisma.citizenshipApplication.findUnique({
    where: { userId },
    select: { status: true },
  });
  const from = (existing?.status as AppStatus | undefined) ?? "DRAFT";
  if (!canTransition(from, "OATH_ACCEPTED")) {
    return badRequest("You must attest before accepting the oath.");
  }

  const application = await prisma.citizenshipApplication.update({
    where: { userId },
    data: {
      motto: parsed.data.motto,
      oathAcceptedAt: new Date(),
      status: "OATH_ACCEPTED",
    },
    select: SELECT,
  });
  return json({ ok: true, application });
}
