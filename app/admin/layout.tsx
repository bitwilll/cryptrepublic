import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/guard";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * The /admin route-group guard (Wave 9 C1). Server-side: unauthenticated →
 * /auth; non-admin → /dashboard (redirect, not a 403 page — non-admins are
 * ordinary users and the admin surface is not advertised; the API layer
 * returns the real 401/403s and is the enforcement, this is UX). Suspended
 * users are already null here — validateSessionToken is the A1 choke point.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/auth");
  if (session.user.role !== "ADMIN") redirect("/dashboard");
  return <AdminShell adminEmail={session.user.email}>{children}</AdminShell>;
}
