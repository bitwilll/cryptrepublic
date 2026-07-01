import type { Metadata } from "next";
import { EmbassyDetail } from "@/components/embassies/EmbassyDetail";

export const metadata: Metadata = {
  title: "Embassy — CryptRepublic",
};

/**
 * Embassy detail (§7.12). Server Component mounting the client island for a code.
 * The dashboard layout already wraps every page in DashboardShell.
 */
export default async function DashboardEmbassyDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <EmbassyDetail code={code} />;
}
