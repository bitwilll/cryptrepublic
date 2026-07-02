import type { Metadata } from "next";
import { ApplicationDetail } from "@/components/admin/ApplicationDetail";

export const metadata: Metadata = {
  title: "Application review — CryptRepublic admin",
  description: "Witness signatures, chain-derived cache (read-only), kycStatus + review note only.",
};

/** Application review detail (Wave 9 C2). The layout guard already gates. */
export default async function AdminApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApplicationDetail applicationId={id} />;
}
