import type { Metadata } from "next";
import { getSession } from "@/lib/auth/guard";
import { UserDetail } from "@/components/admin/UserDetail";

export const metadata: Metadata = {
  title: "User detail — CryptRepublic admin",
  description: "Sessions, suspension, KYC status, linked wallets, application summary.",
};

/**
 * Per-user detail (Wave 9 C2). The layout guard already gates; the session is
 * re-read here only to pass the signed-in admin's id so the island can disable
 * self-suspension (mirrors the API's 400 — UX, the API is the enforcement).
 */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  return <UserDetail userId={id} selfUserId={session?.user.id ?? ""} />;
}
