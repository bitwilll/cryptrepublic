import type { Metadata } from "next";
import Link from "next/link";
import { PasskeysSurface } from "@/components/auth/PasskeysSurface";

export const metadata: Metadata = {
  title: "Passkeys & sign-in security — CryptRepublic",
  description:
    "Add passkeys (Touch ID / Face ID / security keys) for passwordless, phishing-resistant sign-in. The server stores only your public keys.",
};

/**
 * Passkeys & sign-in security (Wave 14). Behind the dashboard session guard;
 * highlights the Wallet nav item via the isActive prefix match (no nav entry
 * needed, matching the Wave-13 approve-login precedent). The client island
 * (PasskeysSurface) holds all navigator.credentials logic; this server shell
 * imports nothing client-only.
 */
export default function SecurityPage(): React.ReactElement {
  return (
    <main className="container" style={{ padding: "24px 0", maxWidth: 640 }}>
      <p style={{ marginBottom: 6 }}>
        <Link className="btn btn-ghost" href="/dashboard/wallet">
          ← Wallet
        </Link>
      </p>
      <h1 style={{ marginTop: 8 }}>Passkeys &amp; sign-in security</h1>
      <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 14, maxWidth: 540 }}>
        A passkey lets you sign in with your device&rsquo;s Touch&nbsp;ID / Face&nbsp;ID or a
        security key — no password, and phishing-resistant. The Republic stores only the
        credential&rsquo;s <b>public</b> key; the private half never leaves your device.
      </p>
      <div style={{ marginTop: 18 }}>
        <PasskeysSurface />
      </div>
    </main>
  );
}
