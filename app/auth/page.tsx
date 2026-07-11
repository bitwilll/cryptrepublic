import Link from "next/link";
import type { Metadata } from "next";
import { Crest } from "@/components/brand/Crest";
import { AuthForm } from "./AuthForm";
import styles from "./auth.module.css";

export const metadata: Metadata = {
  title: "Citizen Access — CryptRepublic",
  description:
    "Authenticate with your sovereign wallet or the e-mail bound to your citizen record.",
};

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  // Wave 17 — a shareable referral link lands here as /auth?ref=<code>; the
  // code rides the register POST and binds the signup to the link owner.
  const { ref } = await searchParams;
  const refCode = typeof ref === "string" && ref.length > 0 ? ref.slice(0, 32) : undefined;
  return (
    <>
      <div className="gov-strip" role="note">
        <div className="wrap">
          <span>
            <b>★</b> CITIZEN ACCESS — OFFICIAL PORTAL OF THE NETWORK STATE №001
          </span>
          <span>BLK 21 408 932 · CHAIN ONLINE</span>
        </div>
      </div>

      <div className={styles.auth}>
        {/* LEFT — state pane */}
        <aside className={styles.pane}>
          <Link className={styles.brand} href="/">
            <Crest tone="light" height={30} />
            CryptRepublic
          </Link>

          <h1>
            Citizen
            <br />
            access <b>point.</b>
          </h1>
          <p className={styles.sub}>
            Authenticate with your sovereign wallet — the key that is also your passport — or with
            the <span style={{ whiteSpace: "nowrap" }}>e-mail</span> bound to your citizen record.
          </p>

          <div className={styles.paneStats}>
            <div>
              <b>48 392</b>
              <span>Citizens</span>
            </div>
            <div>
              <b>21 408 932</b>
              <span>Block height</span>
            </div>
            <div>
              <b>100.00%</b>
              <span>Uptime · 30d</span>
            </div>
          </div>

          <div className={styles.doctrine}>
            <p>
              &quot;No clerk shall stand between a citizen and the Republic. The chain
              authenticates; the chain admits.&quot;
            </p>
            <cite>— CONSTITUTION ART. II §4 · RATIFIED MMXXVI</cite>
          </div>
        </aside>

        {/* RIGHT — form panel */}
        <main className={styles.panel}>
          <AuthForm refCode={refCode} />
        </main>
      </div>
    </>
  );
}
