"use client";
import { useState } from "react";
import { SiweMessage } from "siwe";
import { getAddress } from "viem";
import { activeChain } from "@/lib/config/chain";
import { getAccounts, withEvmSigner } from "@/lib/wallet/embedded/session";

type Phase = "idle" | "busy" | "done" | "error";

/**
 * Verify the EMBEDDED wallet for the logged-in account (closes the gap where
 * an email-registered user could never satisfy resolveApplicantAddress —
 * witness requests and the admin-mint override both need a VERIFIED
 * LinkedWallet). Signs a SIWE message LOCALLY with the unlocked vault and
 * POSTs it to /api/wallet/link — key possession is proven, never asserted;
 * the key never leaves the device.
 */
export function VerifyWalletCard({ requireUnlock }: { requireUnlock: () => boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);

  async function verify() {
    if (!requireUnlock()) return;
    setPhase("busy");
    setError(null);
    try {
      const accounts = getAccounts();
      if (!accounts?.evm) throw new Error("No embedded wallet address available.");
      const address = getAddress(accounts.evm);

      const nonceRes = await fetch("/api/auth/siwe/nonce", { credentials: "same-origin" });
      if (!nonceRes.ok) throw new Error("Could not get a verification nonce.");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Verify this wallet for my CryptRepublic account.",
        uri: window.location.origin,
        version: "1",
        chainId: activeChain().primaryChainId,
        nonce,
        issuedAt: new Date().toISOString(),
      }).prepareMessage();

      const signature = await withEvmSigner(async (account) => {
        if (!account.signMessage) throw new Error("Signer cannot sign messages.");
        return account.signMessage({ message });
      });

      const res = await fetch("/api/wallet/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ message, signature }),
      });
      const data = (await res.json().catch(() => ({}))) as { address?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Wallet verification failed.");
      setLinked(data.address ?? address);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet verification failed.");
      setPhase("error");
    }
  }

  return (
    <article className="pillar" style={{ padding: "18px 22px" }} data-testid="verify-wallet-card">
      <h3 style={{ margin: 0, fontSize: 16 }}>Citizenship wallet</h3>
      <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 12 }}>
        Verify this wallet for your account so the Republic can bind your passport to it (witness
        attestations and admin issuance both resolve YOUR verified wallet — never a typed address).
        Signing happens locally; your key never leaves this device.
      </p>
      {phase === "done" && linked ? (
        <p
          data-testid="verify-wallet-done"
          style={{ marginTop: 10, fontSize: 12, overflowWrap: "anywhere" }}
        >
          Verified ✓ <span style={{ fontFamily: "var(--mono, monospace)" }}>{linked}</span>
        </p>
      ) : (
        <>
          {error && (
            <p role="alert" style={{ color: "#b00020", marginTop: 8, fontSize: 12 }}>
              {error}
            </p>
          )}
          <button
            className="btn btn-primary"
            type="button"
            data-testid="verify-wallet-button"
            disabled={phase === "busy"}
            onClick={verify}
            style={{ marginTop: 10 }}
          >
            {phase === "busy" ? "Verifying…" : "Verify this wallet"}
          </button>
        </>
      )}
    </article>
  );
}
