import type { Metadata } from "next";
import { CommunityApp } from "@/components/community/CommunityApp";

export const metadata: Metadata = {
  title: "Citizens & Messages — CryptRepublic",
  description:
    "Connect with citizens by their anonymous Civic ID, keep your circle of friends and family, and message them — identity disclosure stays in every citizen's own hands.",
};

/**
 * Citizens & messages (Wave 17). Server Component mounting the client
 * island; the dashboard layout already provides the session gate + shell
 * chrome. Citizens are addressed ONLY by Civic ID — the Republic never
 * lists citizens for browsing.
 */
export default function CommunityPage() {
  return <CommunityApp />;
}
