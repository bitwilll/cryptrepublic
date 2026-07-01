import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/AppProviders";
import MintFlow from "./MintFlow";

export const metadata: Metadata = {
  title: "Mint Your Passport — CryptRepublic",
};

/**
 * Server shell for the 4-step mint flow. The interactive flow is a client island
 * mounted inside the wagmi/react-query provider tree (external wallet path) — it
 * does not run on the server. The SEAL step signs `mintWithWitnesses` with the
 * USER'S OWN wallet and broadcasts through `/api/rpc/[chain]`; the server never
 * signs and never holds a key.
 */
export default function MintPage() {
  return (
    <section className="block">
      <div className="wrap">
        <div className="kicker">PASSPORT MINT</div>
        <AppProviders>
          <MintFlow />
        </AppProviders>
      </div>
    </section>
  );
}
