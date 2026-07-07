import type { Metadata } from "next";
import { Crest } from "@/components/brand/Crest";
import { GovStrip } from "@/components/marketing/GovStrip";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { VerifyApp } from "./VerifyApp";
import styles from "./verify.module.css";

export const metadata: Metadata = {
  title: "Verify a Certificate — CryptRepublic",
  description:
    "Verify any CryptRepublic certificate by its public serial — no account required. Signatures are re-checked cryptographically on every lookup.",
};

/**
 * PUBLIC verifier (Wave 15 — Identity) — marketing chrome, no session. Deep
 * links are supported via ?serial=CR-YYYY-XXXXXX. Verification is
 * cryptographic: the server re-recovers the signer from the stored signature
 * over the canonical payload on every lookup.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string }>;
}) {
  const { serial } = await searchParams;
  return (
    <>
      <Crest tone="dark" className="page-watermark" alt="" />
      <GovStrip />
      <SiteHeader />
      <main>
        <section className={`block ${styles.section}`}>
          <div className="wrap">
            <div className="kicker">PUBLIC REGISTRY</div>
            <h1 className={styles.pageTitle}>Verify a certificate</h1>
            <p className={styles.lede}>
              Every certificate issued by a citizen carries a public serial. Enter one to check its
              signature, content fingerprint, and standing — no account required, nothing to
              install. The Republic re-verifies the cryptography on every lookup.
            </p>
            <VerifyApp initialSerial={typeof serial === "string" ? serial : undefined} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
