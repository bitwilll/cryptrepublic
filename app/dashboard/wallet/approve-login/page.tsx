import type { Metadata } from "next";
import Link from "next/link";
import { ApproveLoginSurface } from "@/components/auth/ApproveLoginSurface";

export const metadata: Metadata = {
  title: "Approve a sign-in — CryptRepublic",
  description:
    "Approve a wallet-QR sign-in shown on another device. Your key never leaves this device.",
};

/**
 * Device B: approve a wallet-QR sign-in shown on another device. Behind the
 * dashboard session guard, so the approver is an ALREADY-AUTHENTICATED device
 * that holds the wallet — the stronger anti-phishing posture ("approve a new
 * device for my account"). Signing happens locally on the client surface; this
 * server shell never imports the wallet vault. This device receives no new
 * session (only the scanning device's poll does); the approve endpoint is
 * wallet-proven, not session-gated.
 */
export default function ApproveLoginPage(): React.ReactElement {
  return (
    <main className="container" style={{ padding: "24px 0", maxWidth: 640 }}>
      <p style={{ marginBottom: 6 }}>
        <Link className="btn btn-ghost" href="/dashboard/wallet">
          ← Wallet
        </Link>
      </p>
      <h2 style={{ fontSize: 32, marginTop: 8 }}>Approve a sign-in</h2>
      <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 14, maxWidth: 520 }}>
        Scan a wallet-QR sign-in code shown on another device to sign that device in to your
        account. Your wallet signs locally — your key never leaves this device — and only this
        account&rsquo;s verified wallet can approve.
      </p>
      <div style={{ marginTop: 18 }}>
        <ApproveLoginSurface />
      </div>
    </main>
  );
}
