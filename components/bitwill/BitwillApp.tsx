"use client";
import { useCallback, useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import {
  getAccounts,
  isUnlocked,
  loadPublicAccounts,
  unlock,
  withEvmSigner,
} from "@/lib/wallet/embedded/session";
import { UnlockWalletModal } from "@/components/wallet/UnlockWalletModal";
import { Modal } from "@/components/ui/Modal";
import { Ledger } from "@/components/ui/Ledger";
import { canonicalBitwillPayload } from "@/lib/bitwill/canonical";
import type { DirectiveStatus } from "@/lib/services/types";
import styles from "./bitwill.module.css";

/**
 * BitWill estate registry (Wave 15 A). The directive is signed CLIENT-SIDE by
 * the citizen's own embedded wallet (the witness/QR-login signing utility —
 * `withEvmSigner`); the server verifies recovery and stores only public data.
 * Filing supersedes any ACTIVE directive; revocation needs a confirm.
 */

interface Directive extends Record<string, unknown> {
  id: string;
  beneficiaryName: string;
  beneficiaryContact: string;
  beneficiaryAddress: string | null;
  assetsMemo: string;
  directiveHash: string;
  signerAddress: string;
  status: DirectiveStatus;
  createdAt: string;
  revokedAt: string | null;
}

type Load = { status: "loading" } | { status: "ok"; directives: Directive[] } | { status: "error" };

const CHIP_CLASS: Record<DirectiveStatus, string> = {
  ACTIVE: `${styles.chip} ${styles.chipActive}`,
  REVOKED: `${styles.chip} ${styles.chipRevoked}`,
  SUPERSEDED: styles.chip,
};

function filedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function BitwillApp() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [wallet, setWallet] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [addr, setAddr] = useState("");
  const [memo, setMemo] = useState("");

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const reload = useCallback(() => {
    setLoad({ status: "loading" });
    fetch("/api/bitwill", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { directives: Directive[] }) => setLoad({ status: "ok", directives: d.directives }))
      .catch(() => setLoad({ status: "error" }));
  }, []);

  useEffect(() => {
    reload();
    void loadPublicAccounts().then((a) => setWallet(a?.evm ?? null));
  }, [reload]);

  function requireUnlock(): boolean {
    if (isUnlocked()) return true;
    setShowUnlock(true);
    return false;
  }
  async function onUnlock(pass: string) {
    await unlock(pass);
    setShowUnlock(false);
  }

  const active =
    load.status === "ok" ? (load.directives.find((d) => d.status === "ACTIVE") ?? null) : null;

  async function file(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setStatusMsg("");
    if (!wallet) {
      setFormError(
        "No wallet is available on this device. Create your embedded wallet under Wallet & chain and verify it for your account first.",
      );
      return;
    }
    const beneficiaryAddress = addr.trim();
    if (beneficiaryAddress && !isAddress(beneficiaryAddress)) {
      setFormError("The beneficiary wallet address is not a valid EVM address.");
      return;
    }
    if (!requireUnlock()) return;
    setBusy(true);
    setStatusMsg("Awaiting your local signature…");
    try {
      const accounts = getAccounts();
      if (!accounts?.evm) throw new Error("No embedded wallet address available.");
      const owner = getAddress(accounts.evm);
      const payload = canonicalBitwillPayload({
        owner,
        beneficiaryName: name.trim(),
        beneficiaryContact: contact.trim(),
        ...(beneficiaryAddress ? { beneficiaryAddress } : {}),
        assetsMemo: memo.trim(),
      });
      const signature = await withEvmSigner(async (account) => {
        if (!account.signMessage) throw new Error("Signer cannot sign messages.");
        return account.signMessage({ message: payload });
      });
      setStatusMsg("Filing with the registry…");
      const res = await fetch("/api/bitwill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          beneficiaryName: name.trim(),
          beneficiaryContact: contact.trim(),
          ...(beneficiaryAddress ? { beneficiaryAddress } : {}),
          assetsMemo: memo.trim(),
          signerAddress: owner,
          signature,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The registry could not file your directive.");
      setName("");
      setContact("");
      setAddr("");
      setMemo("");
      setStatusMsg("Directive filed. It is now the directive of record.");
      reload();
    } catch (err) {
      setStatusMsg("");
      setFormError(
        err instanceof Error ? err.message : "The registry could not file your directive.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setConfirmRevoke(false);
    setFormError(null);
    setBusy(true);
    setStatusMsg("Revoking the directive of record…");
    try {
      const res = await fetch("/api/bitwill/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The directive could not be revoked.");
      setStatusMsg("Directive revoked. No directive is currently on file.");
      reload();
    } catch (err) {
      setStatusMsg("");
      setFormError(err instanceof Error ? err.message : "The directive could not be revoked.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.app} data-testid="bitwill-app">
      <div>
        <h1>BitWill — inheritance</h1>
        <p className={styles.lede}>
          Name a beneficiary for your estate record. The directive is signed by your own wallet on
          this device and filed with the Republic&apos;s registry.
        </p>
      </div>

      <div className={styles.notice}>
        <span className={styles.noticeLabel}>Non-custodial instrument</span>A BitWill directive is a
        signed declaration of intent filed with the Republic&apos;s registry. It does not and cannot
        transfer assets — your keys remain yours alone.
      </div>

      <p aria-live="polite" role="status" className={styles.status} data-testid="bitwill-status">
        {statusMsg}
      </p>
      {formError && (
        <p role="alert" className={styles.error} data-testid="bitwill-error">
          {formError}
        </p>
      )}

      {load.status === "loading" && <p className={styles.status}>Consulting the registry…</p>}
      {load.status === "error" && (
        <div className={styles.card}>
          <p className={styles.cardNote}>The registry could not be reached.</p>
          <button className="btn btn-ghost" type="button" onClick={reload}>
            Retry
          </button>
        </div>
      )}

      {load.status === "ok" && (
        <>
          {active ? (
            <article className={styles.deed} data-testid="bitwill-active-deed">
              <div className={styles.deedInner}>
                <div className={styles.deedHead}>
                  <div>
                    <div className={styles.deedKicker}>Directive of record — estate registry</div>
                    <h2 className={styles.deedTitle}>Inheritance directive</h2>
                  </div>
                  <span className={CHIP_CLASS.ACTIVE}>Active</span>
                </div>
                <div className={styles.deedGrid}>
                  <div>
                    <div className={styles.fieldLabel}>Beneficiary</div>
                    <div className={`${styles.fieldValue} ${styles.beneficiaryName}`}>
                      {active.beneficiaryName}
                    </div>
                  </div>
                  <div>
                    <div className={styles.fieldLabel}>Contact</div>
                    <div className={styles.fieldValue}>{active.beneficiaryContact}</div>
                  </div>
                  <div>
                    <div className={styles.fieldLabel}>Beneficiary wallet</div>
                    <div className={`${styles.fieldValue} ${styles.mono}`}>
                      {active.beneficiaryAddress ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className={styles.fieldLabel}>Filed</div>
                    <div className={styles.fieldValue}>{filedDate(active.createdAt)}</div>
                  </div>
                  <div>
                    <div className={styles.fieldLabel}>Signed by</div>
                    <div className={`${styles.fieldValue} ${styles.mono}`}>
                      {active.signerAddress}
                    </div>
                  </div>
                  <div>
                    <div className={styles.fieldLabel}>Directive hash</div>
                    <div className={`${styles.fieldValue} ${styles.mono}`}>
                      {active.directiveHash}
                    </div>
                  </div>
                </div>
                <div className={styles.fieldLabel} style={{ marginTop: 18 }}>
                  Estate memorandum
                </div>
                <div className={styles.memo}>{active.assetsMemo}</div>
                <div className={styles.deedFoot}>
                  <span className={styles.hint}>
                    Filing a new directive supersedes this one; revoking leaves no directive on
                    file.
                  </span>
                  <button
                    className={`btn btn-ghost ${styles.primaryAction}`}
                    type="button"
                    data-testid="bitwill-revoke"
                    disabled={busy}
                    onClick={() => setConfirmRevoke(true)}
                  >
                    Revoke directive
                  </button>
                </div>
              </div>
            </article>
          ) : (
            <div className={styles.empty} data-testid="bitwill-empty">
              No directive is on file for your estate. A BitWill directive is a wallet-signed
              declaration naming a beneficiary for your estate record; it can be superseded or
              revoked by you at any time.
            </div>
          )}

          <article className={styles.card}>
            <h2 className={styles.cardTitle}>
              {active ? "File a new directive" : "File a directive"}
            </h2>
            <p className={styles.cardNote}>
              {active
                ? "Filing a new directive supersedes the current directive of record the moment it is sealed."
                : "Your wallet signs the directive locally; the registry records the signed declaration."}
            </p>
            <form className={styles.form} onSubmit={(e) => void file(e)}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="bw-name">
                  Beneficiary full name
                </label>
                <input
                  id="bw-name"
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="bw-contact">
                  Beneficiary contact (email or citizen no.)
                </label>
                <input
                  id="bw-contact"
                  className={styles.input}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  required
                  minLength={3}
                  maxLength={120}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="bw-addr">
                  Beneficiary wallet address (optional)
                </label>
                <input
                  id="bw-addr"
                  className={styles.input}
                  value={addr}
                  onChange={(e) => setAddr(e.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="bw-memo">
                  Estate memorandum
                </label>
                <textarea
                  id="bw-memo"
                  className={styles.input}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={5}
                />
                <span className={styles.hint}>
                  Describe the estate in plain terms. Never place keys, seed phrases, or passwords
                  in a directive — only its sha256 commitment is signed; the registry refuses
                  anything that reads like key material.
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  className={`btn btn-primary ${styles.primaryAction}`}
                  type="submit"
                  data-testid="bitwill-file"
                  disabled={busy}
                >
                  {busy ? "Working…" : active ? "Sign & supersede" : "Sign & file directive"}
                </button>
                {!wallet && (
                  <span className={styles.hint}>
                    Requires your embedded wallet (Wallet &amp; chain), verified for your account.
                  </span>
                )}
              </div>
            </form>
          </article>

          <article className={styles.card}>
            <h2 className={styles.cardTitle}>Registry ledger</h2>
            <p className={styles.cardNote}>
              Every directive ever filed under your estate record, newest first.
            </p>
            <Ledger<Directive>
              columns={[
                {
                  key: "createdAt",
                  label: "Filed",
                  render: (d) => (
                    <span className={d.status === "ACTIVE" ? "" : styles.dimRow}>
                      {filedDate(d.createdAt)}
                    </span>
                  ),
                },
                {
                  key: "beneficiaryName",
                  label: "Beneficiary",
                  render: (d) => (
                    <span className={d.status === "ACTIVE" ? "" : styles.dimRow}>
                      {d.beneficiaryName}
                    </span>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (d) => <span className={CHIP_CLASS[d.status]}>{d.status}</span>,
                },
                {
                  key: "directiveHash",
                  label: "Directive hash",
                  render: (d) => (
                    <span className={`${styles.mono} ${styles.dimRow}`}>
                      {d.directiveHash.slice(0, 18)}…
                    </span>
                  ),
                },
              ]}
              rows={load.directives}
              getRowKey={(d) => d.id}
              empty="No directives have been filed."
              scrollLabel="Directive history (scrolls horizontally on narrow screens)"
            />
          </article>
        </>
      )}

      {confirmRevoke && (
        <Modal title="Revoke your directive?" onClose={() => setConfirmRevoke(false)}>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
            Revocation strikes the directive of record. No directive will remain on file until you
            sign and file a new one.
          </p>
          <div className={styles.actions} style={{ marginTop: 16 }}>
            <button
              className={`btn btn-primary ${styles.primaryAction}`}
              type="button"
              data-testid="bitwill-revoke-confirm"
              onClick={() => void revoke()}
            >
              Revoke directive
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setConfirmRevoke(false)}>
              Keep it
            </button>
          </div>
        </Modal>
      )}

      {showUnlock && (
        <UnlockWalletModal onUnlock={onUnlock} onCancel={() => setShowUnlock(false)} />
      )}
    </div>
  );
}
