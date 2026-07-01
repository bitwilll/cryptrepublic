import "server-only";
import { requireSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http/responses";

/** GET → the seeded embassy directory (off-chain content). */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession(req);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const embassies = await prisma.embassyDirectory.findMany({
    orderBy: { name: "asc" },
  });
  return json({ embassies });
}
