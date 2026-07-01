import { requireSession } from "@/lib/auth/guard";
import { applicationSchema } from "@/lib/validation/auth";
import { isAllowedOrigin } from "@/lib/auth/csrf";
import { prisma } from "@/lib/db";
import { json, badRequest, forbidden } from "@/lib/http/responses";

export async function GET(req: Request): Promise<Response> {
  let session;
  try {
    ({ session } = await requireSession(req));
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const application = await prisma.citizenshipApplication.findUnique({
    where: { userId: session.userId },
    select: {
      id: true,
      status: true,
      name: true,
      domicileCity: true,
      hostCountry: true,
      motto: true,
    },
  });
  return json({ application });
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
  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) return badRequest("Please check the application fields.");

  const application = await prisma.citizenshipApplication.upsert({
    where: { userId },
    update: { ...parsed.data },
    create: { userId, status: "DRAFT", ...parsed.data },
    select: {
      id: true,
      status: true,
      name: true,
      domicileCity: true,
      hostCountry: true,
      motto: true,
    },
  });
  return json({ ok: true, application });
}
