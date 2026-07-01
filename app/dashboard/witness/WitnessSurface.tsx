"use client";
import { useState } from "react";
import { getAddress, type Address, type Hex } from "viem";
import { activeChain } from "@/lib/config/chain";
import { getAccounts, isUnlocked, withEvmSigner } from "@/lib/wallet/embedded/session";
import { readHasPassport } from "@/lib/passport/client";
import { ATTESTATION_TYPES, attestationDomain, type Attestation } from "@/lib/passport/attestation";
import { passportAddress } from "@/config/contracts";
import { Button } from "@/components/ui/Button";

/**
 * Minimal witness-signing surface — an EXISTING citizen signs an applicant's
 * Attestation. Paste the typed-data request JSON (from the applicant's
 * `/api/applications/witnesses/request`), verify the signer is a citizen, sign
 * the EIP-712 Attestation with the embedded wallet, and POST it to
 * `/api/applications/witnesses/submit` (or return the signature to share back).
 *
 * BOOTSTRAP: full social witness-discovery UX is a documented follow-up
 * (spec §7.4). This surface exercises the REAL EIP-712 + on-chain-verified path.
 */
type State = "idle" | "signing" | "signed" | "error";

interface RequestBlob {
  message: { applicant: string; nameHash: string; nonce: string; deadline: string };
}

export default function WitnessSurface(): React.ReactElement {
  const chainId = activeChain().primaryChainId;
  const [raw, setRaw] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<Hex | null>(null);

  async function sign() {
    setError(null);
    setState("signing");
    try {
      const blob = JSON.parse(raw) as RequestBlob;
      const msg = blob.message;
      if (!msg?.applicant || !msg?.nameHash || !msg?.nonce || !msg?.deadline) {
        throw new Error("Paste a valid witness request (with a message).");
      }
      const self = getAccounts()?.evm;
      if (!self) throw new Error("Unlock or create a wallet to witness.");
      if (!isUnlocked()) throw new Error("Unlock your wallet to sign.");

      const isCitizen = await readHasPassport(chainId, getAddress(self) as Address);
      if (!isCitizen) throw new Error("Only existing citizens may witness a new citizen.");

      const attestation: Attestation = {
        applicant: getAddress(msg.applicant) as Address,
        nameHash: msg.nameHash as Hex,
        nonce: BigInt(msg.nonce),
        deadline: BigInt(msg.deadline),
      };

      const sig = await withEvmSigner(async (account) => {
        if (!account.signTypedData) throw new Error("Signer cannot sign typed data.");
        return account.signTypedData({
          domain: attestationDomain(chainId, passportAddress(chainId)),
          types: ATTESTATION_TYPES,
          primaryType: "Attestation",
          message: attestation,
        });
      });

      // Best-effort: submit directly (works when the applicant is this same user);
      // otherwise the applicant collects the signature out of band.
      await fetch("/api/applications/witnesses/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attestation: {
            applicant: attestation.applicant,
            nameHash: attestation.nameHash,
            nonce: msg.nonce,
            deadline: msg.deadline,
          },
          signature: sig,
        }),
      }).catch(() => undefined);

      setSignature(sig);
      setState("signed");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Could not sign.");
    }
  }

  return (
    <div style={{ marginTop: 16, maxWidth: 640 }}>
      <h1 style={{ marginTop: 8 }}>Witness an applicant</h1>
      <p style={{ color: "var(--muted)", marginTop: 12 }}>
        Paste an applicant&apos;s witness request (the typed-data JSON from their mint flow). You
        must be an existing citizen to witness.
      </p>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={8}
        placeholder='{"message":{"applicant":"0x…","nameHash":"0x…","nonce":"0","deadline":"…"}}'
        style={{
          width: "100%",
          marginTop: 16,
          padding: 12,
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontFamily: "var(--mono)",
          fontSize: 12,
        }}
      />
      <div style={{ marginTop: 16 }}>
        <Button
          variant="gold"
          onClick={sign}
          disabled={state === "signing" || raw.trim().length === 0}
        >
          {state === "signing" ? "SIGNING…" : "SIGN AS WITNESS →"}
        </Button>
      </div>
      {state === "signed" && signature && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: "var(--success)", fontWeight: 700 }}>✓ SIGNED</div>
          <textarea
            readOnly
            value={signature}
            rows={3}
            style={{
              width: "100%",
              marginTop: 8,
              padding: 12,
              border: "1px solid var(--success)",
              borderRadius: 8,
              fontFamily: "var(--mono)",
              fontSize: 12,
            }}
          />
        </div>
      )}
      {error && <div style={{ marginTop: 16, color: "var(--gold-d)" }}>{error}</div>}
    </div>
  );
}
