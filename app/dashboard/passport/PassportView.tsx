"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { activeChain } from "@/lib/config/chain";
import { getAccounts, loadPublicAccounts } from "@/lib/wallet/embedded/session";
import { readPassportStatus, readTotalCitizens, type PassportStatus } from "@/lib/passport/client";
import { decodeBytes32String } from "@/lib/passport/attestation";
import { Button } from "@/components/ui/Button";
import {
  deriveProvisional,
  provisionalDomicile,
  provisionalMotto,
  provisionalName,
  NEUTRAL,
  type AppInfo,
} from "@/lib/passport/provisional";
import { PassportPreview } from "../mint/components/PassportPreview";
import styles from "../mint/mint.module.css";

type LoadState = "loading" | "no-wallet" | "not-citizen" | "citizen" | "error";

/** Whether every char in `s` is printable ASCII/Latin (no control/replacement chars). */
function isPrintable(s: string): boolean {
  if (s.length === 0) return false;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    // Reject C0 controls and the U+FFFD replacement char (opaque-hash decode).
    if (code < 0x20 || code === 0xfffd) return false;
  }
  return true;
}

/** Safely decode a bytes32 short string; opaque/undecodable → a neutral fallback. */
function safeDecode(b?: `0x${string}`): string {
  if (!b) return NEUTRAL;
  try {
    const s = decodeBytes32String(b).trim();
    return isPrintable(s) ? s : NEUTRAL;
  } catch {
    return NEUTRAL;
  }
}

export default function PassportView(): React.ReactElement {
  const chainId = activeChain().primaryChainId;
  const { address: wagmiAddress } = useAccount();
  const [state, setState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<PassportStatus | null>(null);
  const [total, setTotal] = useState<bigint | null>(null);
  const [application, setApplication] = useState<AppInfo | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // The off-chain application (for the provisional card) — fetched in
      // parallel with the chain read; only USED when the chain says not-citizen.
      const appPromise = fetch("/api/applications", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : { application: null }))
        .then((d: { application: AppInfo | null }) => d.application)
        .catch(() => null);

      // Resolve the address: embedded public cached (no unlock) OR wagmi account.
      let addr: Address | null = null;
      const embedded = getAccounts() ?? (await loadPublicAccounts());
      if (embedded?.evm) addr = getAddress(embedded.evm) as Address;
      else if (wagmiAddress) addr = getAddress(wagmiAddress) as Address;

      if (!addr) {
        const app = await appPromise;
        if (mounted) {
          setApplication(app);
          setState("no-wallet");
        }
        return;
      }
      try {
        const s = await readPassportStatus(chainId, addr);
        const t = await readTotalCitizens(chainId).catch(() => null);
        const app = await appPromise;
        if (!mounted) return;
        setStatus(s);
        setTotal(t);
        setApplication(app);
        setState(s.isCitizen ? "citizen" : "not-citizen");
      } catch {
        if (mounted) setState("error");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [chainId, wagmiAddress]);

  if (state === "loading") {
    return <p style={{ color: "var(--muted)", marginTop: 16 }}>Reading your passport on chain…</p>;
  }

  if (state === "error") {
    return (
      <div className={styles.errorBox} style={{ marginTop: 16 }}>
        Could not read the passport contract on this chain. Try again shortly.
      </div>
    );
  }

  if (state === "no-wallet" || state === "not-citizen") {
    const provisional = deriveProvisional(application);

    // A PROVISIONAL passport card — the honest pre-mint look-and-feel. Clearly
    // labeled NOT-YET-ON-CHAIN; the chain (readPassportStatus) remains the sole
    // source of real citizenship, so this never claims to be a sealed passport.
    if (provisional) {
      return (
        <div style={{ marginTop: 16 }} data-testid="passport-provisional">
          <h1 style={{ marginTop: 8 }}>Your passport — {provisional.label.toLowerCase()}</h1>
          <div
            data-testid="passport-provisional-status"
            role="status"
            style={{
              display: "inline-block",
              marginTop: 10,
              padding: "4px 12px",
              border: "1px solid var(--gold)",
              background: "rgba(200, 169, 106, 0.15)",
              color: "var(--navy)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
            }}
          >
            {provisional.label} · NOT YET ON CHAIN
          </div>
          <p style={{ color: "var(--muted)", marginTop: 12, maxWidth: 560, fontSize: 14 }}>
            {provisional.sublabel} This is a provisional preview from your application — it becomes
            your real, non-transferable passport only once it is sealed on chain.
          </p>
          <div style={{ maxWidth: 360, marginTop: 20, opacity: 0.9 }}>
            <PassportPreview
              flippable
              no={NEUTRAL}
              name={provisionalName(application)}
              domicile={provisionalDomicile(application)}
              motto={provisionalMotto(application)}
              issued={provisional.label}
            />
          </div>
          <div style={{ marginTop: 20 }}>
            <Button as="a" variant="primary" href="/dashboard/mint">
              {provisional.cta}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ marginTop: 16, maxWidth: 560 }}>
        <h1 style={{ marginTop: 8 }}>You are not yet a citizen.</h1>
        <p style={{ color: "var(--muted)", marginTop: 12 }}>
          {state === "no-wallet"
            ? "Connect or unlock a wallet, then mint your passport to join the Republic."
            : "Your passport has not been sealed yet. Mint it to join the Republic."}
        </p>
        <div style={{ marginTop: 20 }}>
          <Button as="a" variant="primary" href="/dashboard/mint">
            Mint Your Passport →
          </Button>
        </div>
      </div>
    );
  }

  // Citizen — render the real sealed SBT. No transfer/send control (soulbound).
  const c = status?.citizen;
  const tokenId = status?.tokenId?.toString() ?? NEUTRAL;
  // MAJOR: nameHash may be OPAQUE (genesis/seed citizens use keccak256(abi.encode(addr))),
  // so never reverse it to a display name; show motto/domicile (decodable) instead.
  return (
    <div style={{ marginTop: 16 }}>
      <h1 style={{ marginTop: 8 }}>Your Passport</h1>
      <p style={{ color: "var(--muted)", marginTop: 8 }}>
        Citizen №{tokenId}
        {total !== null ? ` · one of ${total.toString()}` : ""} · non-transferable (soulbound).
      </p>
      <div style={{ maxWidth: 360, marginTop: 20 }}>
        <PassportPreview
          flippable
          no={tokenId}
          name={`CITIZEN №${tokenId}`}
          domicile={safeDecode(c?.domicile)}
          motto={safeDecode(c?.motto)}
          issued={c ? `BLK ${c.mintBlock.toString()}` : "SEALED"}
        />
      </div>
      {status?.tokenURI ? (
        <p style={{ marginTop: 16 }}>
          <a
            href={status.tokenURI}
            target="_blank"
            rel="noreferrer"
            className={styles.sealingCaption}
          >
            VIEW TOKEN METADATA ↗
          </a>
        </p>
      ) : null}
      <p style={{ marginTop: 24 }}>
        <Link className="btn btn-ghost" href="/dashboard">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}
