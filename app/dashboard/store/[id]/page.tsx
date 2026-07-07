import type { Metadata } from "next";
import { ListingDetail } from "@/components/store/ListingDetail";

export const metadata: Metadata = {
  title: "Listing — Citizen Store — CryptRepublic",
  description:
    "A citizen-to-citizen listing on the Republic's registry. Inquire directly with the seller — settlement stays peer-to-peer; the Republic never holds funds.",
};

/**
 * Listing detail (Wave 15 store). Server shell resolving the [id] param and
 * mounting the role-aware client island (buyer inquiry vs. seller thread).
 */
export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingDetail id={id} />;
}
