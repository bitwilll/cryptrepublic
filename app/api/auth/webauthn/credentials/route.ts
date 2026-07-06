import "server-only";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/guard";
import { json } from "@/lib/http/responses";

/**
 * GET /api/auth/webauthn/credentials — the LOGGED-IN account's passkeys.
 * PUBLIC metadata only (never the public key material itself — nothing here is
 * secret, but the list needs only display fields). Includes the account's
 * require-passkey flag so the manage surface reads all state in one call.
 */
export async function GET(req: Request): Promise<Response> {
  let userId: string;
  let passkey2faEnabled: boolean;
  try {
    const { user } = await requireSession(req);
    userId = user.id;
    passkey2faEnabled = user.passkey2faEnabled;
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const rows = await prisma.webAuthnCredential.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      credentialId: true,
      label: true,
      deviceType: true,
      backedUp: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
  return json({
    credentials: rows.map((r) => ({
      id: r.credentialId,
      label: r.label,
      deviceType: r.deviceType,
      backedUp: r.backedUp,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    })),
    passkey2faEnabled,
  });
}
