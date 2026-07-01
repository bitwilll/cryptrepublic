import { getSessionFromRequest } from "@/lib/auth/guard";
import { json } from "@/lib/http/responses";

export async function GET(req: Request): Promise<Response> {
  const s = await getSessionFromRequest(req);
  if (!s) return json({ authenticated: false });
  return json({
    authenticated: true,
    user: { id: s.user.id, email: s.user.email, name: s.user.name },
  });
}
