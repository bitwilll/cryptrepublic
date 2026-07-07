"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { zeroAddress, keccak256, stringToHex } from "viem";
import { activeChain } from "@/lib/config/chain";
import { useCitizen } from "@/components/shell/SessionCitizenProvider";
import { useChainInfo } from "@/lib/hooks/useChainInfo";
import { isUnlocked, unlock } from "@/lib/wallet/embedded/session";
import { proposeEmbedded } from "@/lib/governance/write";
import { canonicalEmbassyContent } from "@/lib/validation/dashboard";
import { Modal } from "@/components/ui/Modal";
import { TxButton } from "@/components/ui/TxButton";
import { UnlockWalletModal } from "@/components/wallet/UnlockWalletModal";

/**
 * Embassies (§7.12) client island. The grid renders the seeded EmbassyDirectory
 * from /api/embassies (per-card live citizen count via the detail page). Propose-
 * embassy is GATED to citizens: the modal (1) submits the on-chain SIGNALLING
 * proposal `propose(0x0, 0, 0x, descriptionHash)` FIRST via proposeEmbedded
 * (returns proposalId), THEN (2) POSTs the off-chain content + returned
 * proposalId/txHash to /api/embassies/proposals. descriptionHash = keccak256 of
 * the canonical content so it matches the on-chain record (the server re-binds
 * proposer===caller AND keccak256(content)===descriptionHash).
 */

interface Embassy {
  code: string;
  name: string;
  neighborhood: string;
  hours: string;
  foundedAt: string;
  brandColor: string;
  city: string;
  country: string;
}

type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

export function EmbassiesApp() {
  const chainId = activeChain().primaryChainId;
  const chain = useChainInfo();
  const { isCitizen } = useCitizen();
  const [embassies, setEmbassies] = useState<Load<Embassy[]>>({ status: "loading" });
  const [showModal, setShowModal] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);

  const load = useCallback(() => {
    setEmbassies({ status: "loading" });
    fetch("/api/embassies")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { embassies?: Embassy[] }) =>
        setEmbassies({ status: "ok", data: Array.isArray(d.embassies) ? d.embassies : [] }),
      )
      .catch(() => setEmbassies({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const requireReady = useCallback((): boolean => {
    if (isUnlocked()) return true;
    setShowUnlock(true);
    return false;
  }, []);

  const onUnlock = useCallback(async (pass: string) => {
    await unlock(pass);
    setShowUnlock(false);
  }, []);

  return (
    <div
      className="wrap"
      style={{ padding: "32px 0", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div className="kicker">EMBASSIES</div>

      <article className="pillar" style={{ padding: "28px 32px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 34 }}>Where the Republic gathers in flesh.</h2>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>
              The directory of embassies. Per-embassy citizen counts are live and self-declared.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!isCitizen}
              onClick={() => setShowModal(true)}
            >
              PROPOSE AN EMBASSY →
            </button>
            {!isCitizen && (
              <p style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                Mint your passport to propose. <Link href="/dashboard/mint">Mint →</Link>
              </p>
            )}
          </div>
        </div>
      </article>

      {embassies.status === "loading" && <Skeleton lines={3} />}
      {embassies.status === "error" && <CardError onRetry={load} testid="embassies-error" />}
      {embassies.status === "ok" && embassies.data.length === 0 && (
        <p style={{ color: "var(--muted)" }}>No embassies in the directory yet.</p>
      )}
      {embassies.status === "ok" && embassies.data.length > 0 && (
        <div
          data-grid="cards"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}
        >
          {embassies.data.map((e) => (
            <EmbassyCard key={e.code} embassy={e} />
          ))}
        </div>
      )}

      {showModal && (
        <ProposeEmbassyModal
          chainId={chainId}
          requireReady={requireReady}
          explorerBase={chain.explorerBase}
          onClose={() => setShowModal(false)}
          onDone={() => {
            setShowModal(false);
            load();
          }}
        />
      )}
      {showUnlock && (
        <UnlockWalletModal onUnlock={onUnlock} onCancel={() => setShowUnlock(false)} />
      )}
    </div>
  );
}

function EmbassyCard({ embassy }: { embassy: Embassy }) {
  return (
    <article className="pillar" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          height: 8,
          background: embassy.brandColor,
        }}
      />
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 style={{ margin: 0, fontSize: 22 }}>{embassy.name}</h3>
          <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>
            EST {embassy.foundedAt}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
          {embassy.neighborhood}
        </div>
        <div
          style={{ marginTop: 12, fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}
        >
          {embassy.hours.toUpperCase()}
        </div>
        <Link
          className="btn"
          href={`/dashboard/embassies/${embassy.code}`}
          style={{ marginTop: 16, width: "100%" }}
        >
          VIEW EMBASSY →
        </Link>
      </div>
    </article>
  );
}

function ProposeEmbassyModal({
  chainId,
  requireReady,
  explorerBase,
  onClose,
  onDone,
}: {
  chainId: number;
  requireReady: () => boolean;
  explorerBase: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  const valid =
    code.trim().length >= 2 &&
    name.trim().length >= 1 &&
    neighborhood.trim().length >= 1 &&
    city.trim().length >= 1 &&
    country.trim().length >= 1;

  /**
   * ON-CHAIN FIRST: propose the signalling proposal, THEN POST the off-chain
   * content bound to the returned proposalId/txHash. Returns the propose txHash
   * so <TxButton> surfaces the confirmation. Throws if either step fails.
   */
  const run = useCallback(async (): Promise<`0x${string}`> => {
    const content = {
      code: code.trim(),
      name: name.trim(),
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      country: country.trim(),
    };
    const descriptionHash = keccak256(stringToHex(canonicalEmbassyContent(content)));
    const { txHash, proposalId } = await proposeEmbedded(
      chainId,
      zeroAddress,
      0n,
      "0x",
      descriptionHash,
    );
    const res = await fetch("/api/embassies/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...content, proposalId: proposalId.toString(), txHash }),
    });
    if (!res.ok) {
      throw new Error("The on-chain proposal was created, but recording its content failed.");
    }
    return txHash;
  }, [chainId, code, name, neighborhood, city, country]);

  return (
    <Modal title="Propose an embassy" onClose={onClose}>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
        This creates an on-chain signalling proposal first, then records the embassy&rsquo;s
        details.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        <Field label="Code (2–8)" testid="propose-code" value={code} onChange={setCode} />
        <Field label="Name" testid="propose-name" value={name} onChange={setName} />
        <Field
          label="Neighborhood"
          testid="propose-neighborhood"
          value={neighborhood}
          onChange={setNeighborhood}
        />
        <Field label="City" testid="propose-city" value={city} onChange={setCity} />
        <Field label="Country" testid="propose-country" value={country} onChange={setCountry} />
      </div>
      <div style={{ marginTop: 16 }} data-testid="propose-submit-wrap">
        <TxButton
          label="Propose"
          disabled={!valid}
          disabledReason={!valid ? "Fill every field to propose." : undefined}
          requireReady={requireReady}
          explorerBase={explorerBase}
          testnet
          onRun={run}
          onSuccess={onDone}
        />
      </div>
    </Modal>
  );
}

function Field({
  label,
  testid,
  value,
  onChange,
}: {
  label: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      <span style={{ color: "var(--muted)", fontWeight: 600 }}>{label}</span>
      <input
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "8px 10px", border: "1px solid var(--line)", font: "inherit" }}
      />
    </label>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          data-testid="skeleton-line"
          style={{ height: 14, background: "var(--paper)", border: "1px solid var(--line)" }}
        />
      ))}
    </div>
  );
}

function CardError({ onRetry, testid }: { onRetry: () => void; testid: string }) {
  return (
    <div data-testid={testid}>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>Could not load the directory.</p>
      <button className="btn" type="button" onClick={onRetry} style={{ marginTop: 8 }}>
        Retry
      </button>
    </div>
  );
}
