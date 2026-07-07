"use client";
import { useCallback, useEffect, useState } from "react";
import {
  loadPublicAccounts,
  isUnlocked,
  unlock,
  withEvmSigner,
} from "@/lib/wallet/embedded/session";
import { UnlockWalletModal } from "@/components/wallet/UnlockWalletModal";
import {
  canonicalPayload,
  normalizeText,
  sha256Hex,
  sha256HexOfText,
} from "@/lib/certificates/canonical";
import type { CertificateKind } from "@/lib/services/types";
import styles from "./certificates.module.css";

/**
 * Signing message & certificate (Wave 15 — Identity). The citizen signs the
 * CANONICAL payload CLIENT-SIDE with the sovereign wallet (same signing path
 * as the QR-login and witness flows — the key never leaves the device). For
 * DOCUMENT certificates the file is hashed locally via crypto.subtle: only its
 * SHA-256 fingerprint is signed and stored; the file itself never leaves the
 * device. The server stores the public record and anyone can verify at
 * /verify without an account.
 */

interface CertRow {
  serial: string;
  kind: CertificateKind;
  title: string;
  subject: string;
  contentHash: string;
  signerAddress: string;
  signature: string;
  issuedAt: string;
  revokedAt: string | null;
}
type Load = { status: "loading" } | { status: "ok"; certificates: CertRow[] } | { status: "error" };
type Phase = "idle" | "signing" | "submitting";

function verifyUrl(serial: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://cryptrepublic.com";
  return `${origin}/verify?serial=${serial}`;
}

export function CertificatesApp(): React.ReactElement {
  const [list, setList] = useState<Load>({ status: "loading" });
  const [mode, setMode] = useState<CertificateKind>("MESSAGE");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<{ name: string; hash: string } | null>(null);
  const [hashing, setHashing] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<CertRow | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [armedRevoke, setArmedRevoke] = useState<string | null>(null);

  const load = useCallback(() => {
    setList({ status: "loading" });
    fetch("/api/certificates", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { certificates: CertRow[] }) =>
        setList({ status: "ok", certificates: d.certificates }),
      )
      .catch(() => setList({ status: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setFile(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setHashing(true);
    try {
      const hash = await sha256Hex(await f.arrayBuffer());
      setFile({ name: f.name, hash });
    } catch {
      setError("Could not fingerprint the file in this browser.");
    } finally {
      setHashing(false);
    }
  }

  /** Assemble the fields to sign, or surface a form error and return null. */
  async function prepare(): Promise<{
    kind: CertificateKind;
    title: string;
    subject: string;
    contentHash: string;
  } | null> {
    const t = normalizeText(title).trim();
    if (t.length < 3 || t.length > 120) {
      setError("Give the certificate a title of 3 to 120 characters.");
      return null;
    }
    if (mode === "MESSAGE") {
      const m = normalizeText(message);
      if (m.trim().length === 0 || m.length > 2000) {
        setError("Enter the message to certify (up to 2000 characters).");
        return null;
      }
      return { kind: "MESSAGE", title: t, subject: m, contentHash: await sha256HexOfText(m) };
    }
    if (!file) {
      setError("Choose the document to fingerprint.");
      return null;
    }
    return { kind: "DOCUMENT", title: t, subject: file.name, contentHash: file.hash };
  }

  async function signAndSubmit(): Promise<void> {
    const fields = await prepare();
    if (!fields) return;
    setPhase("signing");
    try {
      const payload = canonicalPayload(fields);
      const signature = await withEvmSigner(async (account) => {
        if (!account.signMessage) throw new Error("This signer cannot sign messages.");
        return account.signMessage({ message: payload });
      });
      setPhase("submitting");
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...fields, signature }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        certificate?: CertRow;
        error?: string;
      };
      if (!res.ok || !data.certificate) {
        throw new Error(
          data.error === "Signature does not match a linked wallet."
            ? "Signature does not match a linked wallet. Verify this wallet for your account under Wallet & chain first."
            : (data.error ?? "The registry could not record the certificate."),
        );
      }
      setIssued(data.certificate);
      setTitle("");
      setMessage("");
      setFile(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign the certificate.");
    } finally {
      setPhase("idle");
    }
  }

  async function issue(): Promise<void> {
    setError(null);
    const accounts = await loadPublicAccounts();
    if (!accounts?.evm) {
      setError("Create or import your sovereign wallet first (Wallet & chain).");
      return;
    }
    if (!isUnlocked()) {
      setShowUnlock(true);
      return;
    }
    await signAndSubmit();
  }

  async function copy(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setError("Could not copy — copy the text manually.");
    }
  }

  async function revoke(serial: string): Promise<void> {
    if (armedRevoke !== serial) {
      setArmedRevoke(serial);
      return;
    }
    setArmedRevoke(null);
    setError(null);
    try {
      const res = await fetch(`/api/certificates/${serial}/revoke`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not revoke the certificate.");
      if (issued?.serial === serial) {
        setIssued({ ...issued, revokedAt: new Date().toISOString() });
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke the certificate.");
    }
  }

  const busy = phase !== "idle";

  return (
    <>
      {issued && (
        <section aria-label="Issued certificate" data-testid="issued-deed">
          <Deed cert={issued} onCopy={copy} copied={copied} />
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className={styles.ghostBtn} onClick={() => setIssued(null)}>
              Issue another
            </button>
          </div>
        </section>
      )}

      {!issued && (
        <section className={styles.card} data-testid="certificate-form">
          <h2 className={styles.microLabel}>Issue a certificate · signed by your wallet</h2>

          <div className={styles.modes} role="group" aria-label="Certificate kind">
            <button
              type="button"
              className={`${styles.mode} ${mode === "MESSAGE" ? styles.modeActive : ""}`}
              aria-pressed={mode === "MESSAGE"}
              onClick={() => setMode("MESSAGE")}
              data-testid="mode-message"
            >
              Message
            </button>
            <button
              type="button"
              className={`${styles.mode} ${mode === "DOCUMENT" ? styles.modeActive : ""}`}
              aria-pressed={mode === "DOCUMENT"}
              onClick={() => setMode("DOCUMENT")}
              data-testid="mode-document"
            >
              Document
            </button>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="cert-title">
              Certificate title
            </label>
            <input
              id="cert-title"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Statement of record"
              data-testid="cert-title"
            />
          </div>

          {mode === "MESSAGE" ? (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="cert-message">
                Message to certify
              </label>
              <textarea
                id="cert-message"
                className={styles.textarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={6}
                placeholder="I attest, before the Republic, that…"
                data-testid="cert-message"
              />
            </div>
          ) : (
            <>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="cert-file">
                  Document to fingerprint
                </label>
                <input
                  id="cert-file"
                  className={styles.fileInput}
                  type="file"
                  onChange={(e) => void onFileChange(e)}
                  data-testid="cert-file"
                />
              </div>
              <p className={styles.privacyNote}>
                The file never leaves your device — it is hashed locally and only its SHA-256
                fingerprint is signed and recorded. The Republic never receives the document itself.
              </p>
              <p className={styles.status} aria-live="polite" data-testid="file-hash-status">
                {hashing
                  ? "Fingerprinting the file locally…"
                  : file
                    ? `${file.name} — fingerprint ready`
                    : ""}
              </p>
              {file && (
                <p className={styles.hashLine} data-testid="file-hash">
                  SHA-256: {file.hash}
                </p>
              )}
            </>
          )}

          {error && (
            <p role="alert" className={styles.error} data-testid="cert-error">
              {error}
            </p>
          )}
          <p className={styles.status} aria-live="polite" data-testid="cert-status">
            {phase === "signing"
              ? "Your wallet is signing locally — the key never leaves this device."
              : phase === "submitting"
                ? "Recording the public certificate…"
                : ""}
          </p>

          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void issue()}
            disabled={busy || hashing}
            data-testid="cert-issue"
          >
            {busy ? "Signing…" : "Sign & issue certificate"}
          </button>
        </section>
      )}

      <section className={styles.card} data-testid="certificate-list">
        <h2 className={styles.microLabel}>Your certificates · public registry</h2>
        {list.status === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </div>
        )}
        {list.status === "error" && (
          <>
            <p className={styles.empty} role="alert">
              Could not load your certificates.
            </p>
            <button type="button" className={styles.ghostBtn} onClick={load}>
              Retry
            </button>
          </>
        )}
        {list.status === "ok" &&
          (list.certificates.length === 0 ? (
            <p className={styles.empty}>No certificates issued yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Serial</th>
                    <th scope="col">Title</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Issued</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.certificates.map((c) => (
                    <tr key={c.serial} data-testid="certificate-row">
                      <td className={styles.serialCell}>{c.serial}</td>
                      <td style={{ overflowWrap: "anywhere" }}>{c.title}</td>
                      <td>{c.kind === "MESSAGE" ? "Message" : "Document"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(c.issuedAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${c.revokedAt ? styles.badgeRevoked : styles.badgeIssued}`}
                        >
                          {c.revokedAt ? "Revoked" : "Issued"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.ghostBtn}
                            onClick={() => void copy(verifyUrl(c.serial), `row-${c.serial}`)}
                          >
                            {copied === `row-${c.serial}` ? "Copied" : "Copy link"}
                          </button>
                          {!c.revokedAt && (
                            <button
                              type="button"
                              className={styles.dangerBtn}
                              onClick={() => void revoke(c.serial)}
                              data-testid={`revoke-${c.serial}`}
                            >
                              {armedRevoke === c.serial ? "Confirm revoke" : "Revoke"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>

      {showUnlock && (
        <UnlockWalletModal
          onUnlock={async (passphrase) => {
            await unlock(passphrase);
            setShowUnlock(false);
            await signAndSubmit();
          }}
          onCancel={() => setShowUnlock(false)}
        />
      )}
    </>
  );
}

/** The official deed view of one certificate. */
function Deed({
  cert,
  onCopy,
  copied,
}: {
  cert: CertRow;
  onCopy: (text: string, key: string) => Promise<void>;
  copied: string | null;
}): React.ReactElement {
  const url = verifyUrl(cert.serial);
  const revoked = cert.revokedAt != null;
  return (
    <article className={styles.deed} data-testid="certificate-deed">
      <header className={styles.deedHeader}>
        <div
          className={`${styles.deedState} ${revoked ? styles.deedStateRevoked : styles.deedStateValid}`}
          data-testid="deed-state"
        >
          {revoked ? "Revoked by the author" : "Certificate of record"}
        </div>
        <h2 className={styles.deedTitle}>{cert.title}</h2>
        <div className={styles.deedSerial} data-testid="deed-serial">
          {cert.serial}
        </div>
      </header>
      <div className={styles.deedGrid}>
        <div className={styles.deedField}>
          <div className={styles.microLabel}>Kind</div>
          <div className={styles.deedValue}>
            {cert.kind === "MESSAGE" ? "Signed message" : "Signed document fingerprint"}
          </div>
        </div>
        <div className={styles.deedField}>
          <div className={styles.microLabel}>Issued</div>
          <div className={styles.deedValue}>
            {new Date(cert.issuedAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </div>
        </div>
        <div className={`${styles.deedField} ${styles.deedFieldWide}`}>
          <div className={styles.microLabel}>
            {cert.kind === "MESSAGE" ? "Certified message" : "Document name"}
          </div>
          <div className={`${styles.deedValue} ${styles.deedSubject}`}>{cert.subject}</div>
        </div>
        <div className={`${styles.deedField} ${styles.deedFieldWide}`}>
          <div className={styles.microLabel}>Content SHA-256</div>
          <div className={`${styles.deedValue} ${styles.deedValueMono}`}>{cert.contentHash}</div>
        </div>
        <div className={`${styles.deedField} ${styles.deedFieldWide}`}>
          <div className={styles.microLabel}>Signer address</div>
          <div className={`${styles.deedValue} ${styles.deedValueMono}`}>{cert.signerAddress}</div>
        </div>
      </div>
      <footer className={styles.deedFooter}>
        <span className={styles.verifyUrl} data-testid="deed-verify-url">
          {url}
        </span>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => void onCopy(url, `deed-${cert.serial}`)}
          data-testid="deed-copy"
        >
          {copied === `deed-${cert.serial}` ? "Copied" : "Copy verification URL"}
        </button>
      </footer>
    </article>
  );
}
