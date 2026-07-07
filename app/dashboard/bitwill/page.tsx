import type { Metadata } from "next";
import { BitwillApp } from "@/components/bitwill/BitwillApp";

export const metadata: Metadata = {
  title: "BitWill Estate — CryptRepublic",
  description:
    "File a wallet-signed inheritance directive with the Republic's registry. A signed declaration of intent — it never holds or moves funds.",
};

/**
 * BitWill estate registry (Wave 15 A). Server shell; the signing flow is a
 * client island — the directive is signed by the CITIZEN'S OWN wallet on their
 * device and the server stores only public data (addresses, signature, hashes).
 */
export default function BitwillPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="kicker">ESTATE REGISTRY</div>
        <BitwillApp />
      </div>
    </section>
  );
}
