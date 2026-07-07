import type { Metadata } from "next";
import { StoreApp } from "@/components/store/StoreApp";

export const metadata: Metadata = {
  title: "Citizen Store — CryptRepublic",
  description:
    "The citizen-to-citizen marketplace of the Republic. Browse listings, file your own, and inquire directly — settlement stays peer-to-peer; the Republic never holds funds.",
};

/**
 * Citizen Store (Wave 15). Server Component mounting the client island; the
 * dashboard layout already provides the session gate + shell chrome. No
 * payment is executed anywhere in this vertical — pricing is intent only.
 */
export default function StorePage() {
  return <StoreApp />;
}
