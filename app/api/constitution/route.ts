import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";

/** GET → the seeded constitution/doctrine text (off-chain content). */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const texts = await prisma.constitutionText.findMany({
    orderBy: { key: "asc" },
    select: { key: true, title: true, body: true, citation: true },
  });
  return json({ texts });
}
