"use client";
import { useCallback, useEffect, useState } from "react";
import { getAddress, type Address, type Hex } from "viem";
import { activeChain } from "@/lib/config/chain";
import { getAccounts, isUnlocked } from "@/lib/wallet/embedded/session";
import { readHasPassport, readRequiredWitnesses } from "@/lib/passport/client";
import { toBytes32String } from "@/lib/passport/attestation";
import { submitMintEmbedded, StaleAttestationsError, type MintArgs } from "@/lib/passport/mint";
import type { Attestation } from "@/lib/passport/attestation";
import { Button } from "@/components/ui/Button";
import styles from "./mint.module.css";
import { MintStepper } from "./components/MintStepper";
import { PassportPreview } from "./components/PassportPreview";
import { MintAttestStep, type AttestForm } from "./steps/MintAttestStep";
import { MintOathStep, type OathForm } from "./steps/MintOathStep";
import { MintWitnessStep } from "./steps/MintWitnessStep";
import { MintSealStep, type SealState } from "./steps/MintSealStep";
import { MintSealedReceipt } from "./steps/MintSealedReceipt";

type WitnessRequest = {
  message: { applicant: string; nameHash: string; nonce: string; deadline: string };
  requiredWitnesses: number;
};
type CollectedWitnesses = {
  applicant: string | null;
  nameHash: string | null;
  /** The OUTSTANDING request context (null when none was ever persisted). */
  nonce?: string | null;
  deadline?: string | null;
  signatures: { witnessAddress: string; signature: string; nonce: string; deadline: string }[];
};
type SavedApplication = {
  status: string;
  name: string | null;
  domicileCity: string | null;
  hostCountry: string | null;
  motto: string | null;
  citizenTokenId: string | null;
};

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export default function MintFlow(): React.ReactElement {
  const chainId = activeChain().primaryChainId;
  const [step, setStep] = useState(0);
  const [attest, setAttest] = useState<AttestForm>({
    name: "",
    city: "Lisbon",
    country: "Portugal",
  });
  const [oath, setOath] = useState<OathForm>({ motto: "", accepted: false });
  const [witnessReady, setWitnessReady] = useState(false);
  const [collected, setCollected] = useState(0);
  const [required, setRequired] = useState(7);
  const [sealState, setSealState] = useState<SealState>("idle");
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [alreadyCitizen, setAlreadyCitizen] = useState(false);
  const [resuming, setResuming] = useState(true);
  // Steps 0-1 are COMMITTED server-side (status OATH_ACCEPTED+): re-submitting
  // Attest from there is rejected by the state machine, so BACK is locked.
  const [locked, setLocked] = useState(false);
  const [sealedTokenId, setSealedTokenId] = useState<string | null>(null);

  // On mount: if the user's public embedded address is already a citizen,
  // short-circuit. Uses getAccounts().evm (PUBLIC cached, no unlock); handles
  // getAccounts() === null (no wallet yet → proceed to attest).
  useEffect(() => {
    let mounted = true;
    (async () => {
      const accts = getAccounts();
      if (!accts?.evm) return;
      try {
        const is = await readHasPassport(chainId, getAddress(accts.evm) as Address);
        if (mounted && is) setAlreadyCitizen(true);
      } catch {
        /* no passport contract on this chain / RPC down → proceed to attest */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [chainId]);

  const refreshWitnesses = useCallback(async () => {
    const res = await fetch("/api/applications/witnesses/request");
    if (!res.ok) return;
    const data = (await res.json()) as WitnessRequest;
    setRequired(data.requiredWitnesses);
    const collectedRes = await fetch("/api/applications/witnesses");
    if (collectedRes.ok) {
      const c = (await collectedRes.json()) as CollectedWitnesses;
      setCollected(c.signatures.length);
    }
  }, []);

  // RESUME the saved application on mount (live report: revisiting /dashboard/mint
  // restarted at Attest — re-submitting from OATH_ACCEPTED 400s, and re-entering
  // the witness step via `witnesses/request` would ROTATE the nonce and wipe the
  // collected signatures). Prefill the saved fields (seal() rebuilds motto/domicile
  // from them), jump to the step the status implies, and NEVER rotate when a live
  // outstanding request exists.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/applications");
        if (!res.ok || !mounted) return;
        const { application } = (await res.json()) as { application: SavedApplication | null };
        if (!mounted || !application) return;

        setAttest((f) => ({
          name: application.name ?? f.name,
          city: application.domicileCity ?? f.city,
          country: application.hostCountry ?? f.country,
        }));
        if (application.motto) setOath({ motto: application.motto, accepted: true });

        const st = application.status;
        if (st === "SEALED") {
          setSealedTokenId(application.citizenTokenId ?? "");
          return;
        }
        if (st === "ATTESTED") {
          setStep(1);
          return;
        }
        if (st === "OATH_ACCEPTED" || st === "WITNESSED") {
          setLocked(true);
          setStep(2);
          const wres = await fetch("/api/applications/witnesses");
          if (wres.ok && mounted) {
            const c = (await wres.json()) as CollectedWitnesses;
            setCollected(c.signatures.length);
            const live =
              Boolean(c.nonce) && Boolean(c.deadline) && Number(c.deadline) * 1000 > Date.now();
            if (!live && st === "OATH_ACCEPTED") {
              // No outstanding (or an expired) request — rotating is CORRECT here:
              // expired-deadline sigs are unusable on-chain anyway.
              await refreshWitnesses();
            }
          }
          try {
            setRequired(await readRequiredWitnesses(chainId));
          } catch {
            /* unregistered chain / RPC down — keep the default of 7 */
          }
        }
      } finally {
        if (mounted) setResuming(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [chainId, refreshWitnesses]);

  // Poll the collected count while on the Witness step.
  useEffect(() => {
    if (step !== 2) return;
    let mounted = true;
    const tick = async () => {
      const res = await fetch("/api/applications/witnesses");
      if (!res.ok || !mounted) return;
      const c = (await res.json()) as CollectedWitnesses;
      setCollected(c.signatures.length);
    };
    void tick();
    const id = setInterval(tick, 4000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [step]);

  function canAdvance(): boolean {
    if (step === 0) return attest.name.trim().length > 2 && attest.city.trim().length > 1;
    if (step === 1) return oath.accepted && oath.motto.trim().length > 4;
    if (step === 2) return witnessReady && collected >= required;
    return false;
  }

  async function advance() {
    setError(null);
    setBusy(true);
    try {
      if (step === 0) {
        const res = await postJson("/api/applications/attest", {
          name: attest.name.trim(),
          domicileCity: attest.city.trim(),
          hostCountry: attest.country.trim(),
        });
        if (!res.ok) throw new Error("Could not save your attestation.");
        setStep(1);
      } else if (step === 1) {
        const res = await postJson("/api/applications/oath", {
          motto: oath.motto.trim(),
          oathAccepted: true,
        });
        if (!res.ok) throw new Error("Could not record your oath.");
        await refreshWitnesses();
        setStep(2);
      } else if (step === 2) {
        setStep(3);
        await seal();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function resetWitnessCollection() {
    // A fresh nonce invalidates all prior sigs (single-outstanding-request
    // invariant). Re-request rotates the nonce + clears old sigs server-side.
    await refreshWitnesses();
    setWitnessReady(false);
    setStep(2);
  }

  async function seal() {
    setSealState("pending");
    setError(null);
    try {
      // Rebuild the exact mint args from the collected sigs (stored nonce/deadline).
      const res = await fetch("/api/applications/witnesses");
      if (!res.ok) throw new Error("Could not load your witness signatures.");
      const data = (await res.json()) as CollectedWitnesses;
      if (!data.applicant || !data.nameHash || data.signatures.length === 0) {
        throw new Error("No witness signatures collected yet.");
      }
      const attestations: Attestation[] = data.signatures.map((s) => ({
        applicant: getAddress(data.applicant!) as Address,
        nameHash: data.nameHash as Hex,
        nonce: BigInt(s.nonce),
        deadline: BigInt(s.deadline),
      }));
      const signatures = data.signatures.map((s) => s.signature as Hex);
      const args: MintArgs = {
        chainId,
        nameHash: data.nameHash as Hex,
        motto: toBytes32String(oath.motto.trim().slice(0, 31)),
        domicile: toBytes32String(attest.city.trim().slice(0, 31)),
        oathAccepted: true,
        attestations,
        signatures,
      };

      if (!isUnlocked()) {
        throw new Error("Unlock your wallet to sign the mint.");
      }
      // Embedded path: signs locally + sendRawTransaction (NO eth_sendTransaction).
      const result = await submitMintEmbedded(args);
      setTokenId(result.tokenId.toString());
      setTxHash(result.txHash);
      await postJson("/api/applications/seal/confirm", {
        txHash: result.txHash,
        tokenId: result.tokenId.toString(),
      });
      setSealState("mined");
    } catch (e) {
      setSealState("error");
      if (e instanceof StaleAttestationsError) {
        setError(
          "Your witness attestations are stale (your on-chain nonce changed); witnesses must re-sign.",
        );
        await resetWitnessCollection();
        return;
      }
      const msg = e instanceof Error ? e.message : "The mint failed.";
      setError(/AlreadyCitizen/i.test(msg) ? "You are already a citizen." : msg);
    }
  }

  if (alreadyCitizen || sealedTokenId !== null) {
    return (
      <div className={styles.card}>
        <span className={`${styles.tag} ${styles.tagSuccess}`}>✓ ALREADY SEALED</span>
        <h2 className={styles.heading}>You are already a citizen.</h2>
        <p className={styles.lede}>
          {alreadyCitizen
            ? "Your passport is sealed. View it any time."
            : "Your application records a sealed passport. View it any time — the chain is the authority."}
        </p>
        <div className={styles.receiptActions} style={{ justifyContent: "flex-start" }}>
          <Button as="a" variant="dark" href="/dashboard/passport">
            VIEW MY PASSPORT →
          </Button>
        </div>
      </div>
    );
  }

  if (resuming) {
    return (
      <div className={styles.card} data-testid="mint-resuming">
        <p className={styles.lede}>Loading your application…</p>
      </div>
    );
  }

  const sealed = sealState === "mined";

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.card}>
          <MintStepper step={step} sealed={sealed} />
          <div className={styles.content}>
            {step === 0 && (
              <MintAttestStep form={attest} onChange={(p) => setAttest((f) => ({ ...f, ...p }))} />
            )}
            {step === 1 && (
              <MintOathStep form={oath} onChange={(p) => setOath((f) => ({ ...f, ...p }))} />
            )}
            {step === 2 && (
              <>
                <p
                  data-testid="witness-waiting-note"
                  style={{
                    margin: "0 0 14px",
                    padding: "10px 14px",
                    background: "var(--paper)",
                    border: "1px solid var(--line)",
                    fontSize: 13,
                    color: "var(--muted)",
                  }}
                >
                  Waiting for witness attestations — {collected} of {required} collected. Your
                  application is saved; you can leave this page and it will resume here.
                </p>
                <MintWitnessStep
                  collected={collected}
                  required={required}
                  ready={witnessReady}
                  onReadyChange={setWitnessReady}
                />
              </>
            )}
            {step === 3 && !sealed && <MintSealStep state={sealState} />}
            {step === 3 && sealed && tokenId && (
              <MintSealedReceipt
                tokenId={tokenId}
                txHash={txHash ?? undefined}
                explorer={undefined}
              />
            )}

            {error && <div className={styles.errorBox}>{error}</div>}
          </div>

          {step < 3 && (
            <div className={styles.nav}>
              <button
                className="btn btn-ghost"
                disabled={step === 0 || busy || (locked && step <= 2)}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                ← BACK
              </button>
              <span className={styles.navCount}>STEP {step + 1} / 4</span>
              <button
                className={`btn ${canAdvance() ? "btn-gold" : "btn-ghost"}`}
                disabled={!canAdvance() || busy}
                onClick={advance}
              >
                {step === 2 ? "SEAL MY PASSPORT" : "CONTINUE"} →
              </button>
            </div>
          )}
        </div>
      </div>

      <aside className={styles.aside}>
        <div className={styles.asideLabel}>YOUR PASSPORT · {sealed ? "SEALED" : "DRAFT"}</div>
        <PassportPreview
          no={sealed && tokenId ? tokenId : "— — — —"}
          name={attest.name ? attest.name.toUpperCase() : "YOUR NAME"}
          domicile={attest.city || undefined}
          motto={oath.motto || undefined}
          issued={sealed ? "SEALED" : "AWAITING SEAL"}
        />
        <div className={styles.asideNote}>
          The passport updates as you fill in your attestation. Once sealed, it is permanent and
          non-transferable.
        </div>
      </aside>
    </div>
  );
}
