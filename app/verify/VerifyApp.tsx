"use client";
import { useCallback, useEffect, useState } from "react";
import { sha256Hex } from "@/lib/certificates/canonical";
import type { CertificateKind } from "@/lib/services/types";
import styles from "./verify.module.css";

/**
 * Public certificate verifier (Wave 15 — Identity). No account required. Looks
 * a serial up via GET /api/certificates/verify — the server RE-RECOVERS the
 * signer from the stored signature over the rebuilt canonical payload (pure
 * cryptography), so the verdict never trusts the write path. For DOCUMENT
 * certificates an optional local re-hash checker compares a file's SHA-256
 * with the certified fingerprint ENTIRELY client-side — the file is never
 * uploaded.
 */

interface VerifyPayload {
  serial: string;
  kind: CertificateKind;
  title: string;
  subject: string;
  contentHash: string;
  signerAddress: string;
  signature: string;
  issuedAt: string;
  revoked: boolean;
  revokedAt: string | null;
  signatureValid: boolean;
  signerHeldPassportRecord: boolean;
}
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "notFound"; serial: string }
  | { status: "error" }
  | { status: "ok"; data: VerifyPayload };

const SERIAL_RE = /^CR-\d{4}-[A-Z2-7]{6}$/;

export function VerifyApp({ initialSerial }: { initialSerial?: string }): React.ReactElement {
  const [serial, setSerial] = useState(initialSerial ?? "");
  const [state, setState] = useState<State>({ status: "idle" });
  const [formError, setFormError] = useState<string | null>(null);
  const [rehash, setRehash] = useState<{ hash: string; name: string } | null>(null);
  const [hashing, setHashing] = useState(false);

  const lookup = useCallback((raw: string) => {
    const s = raw.trim().toUpperCase();
    setFormError(null);
    setRehash(null);
    if (!SERIAL_RE.test(s)) {
      setFormError("Enter a serial in the issued form: CR-YYYY-XXXXXX.");
      return;
    }
    setState({ status: "loading" });
    fetch(`/api/certificates/verify?serial=${encodeURIComponent(s)}`)
      .then(async (r) => {
        if (r.status === 404) {
          setState({ status: "notFound", serial: s });
          return;
        }
        if (!r.ok) throw new Error("failed");
        const data = (await r.json()) as VerifyPayload;
        setState({ status: "ok", data });
        // Deep-linkable: reflect the looked-up serial in the URL.
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", `/verify?serial=${encodeURIComponent(s)}`);
        }
      })
      .catch(() => setState({ status: "error" }));
  }, []);

  useEffect(() => {
    if (initialSerial) lookup(initialSerial);
  }, [initialSerial, lookup]);

  async function onRehashFile(e: React.ChangeEvent<HTMLInputElement>) {
    setRehash(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setHashing(true);
    try {
      setRehash({ name: f.name, hash: await sha256Hex(await f.arrayBuffer()) });
    } catch {
      setFormError("Could not fingerprint the file in this browser.");
    } finally {
      setHashing(false);
    }
  }

  const verdict =
    state.status === "ok"
      ? state.data.revoked
        ? "REVOKED"
        : state.data.signatureValid
          ? "VALID"
          : "INVALID"
      : null;

  return (
    <>
      <form
        className={styles.lookup}
        onSubmit={(e) => {
          e.preventDefault();
          lookup(serial);
        }}
        data-testid="verify-form"
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="verify-serial">
            Certificate serial
          </label>
          <input
            id="verify-serial"
            className={styles.input}
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="CR-2026-XXXXXX"
            autoComplete="off"
            spellCheck={false}
            data-testid="verify-serial"
          />
        </div>
        <button
          type="submit"
          className={styles.verifyBtn}
          disabled={state.status === "loading"}
          data-testid="verify-submit"
        >
          {state.status === "loading" ? "Checking…" : "Verify"}
        </button>
      </form>

      {formError && (
        <p role="alert" className={styles.error}>
          {formError}
        </p>
      )}

      <p className={styles.status} aria-live="polite" data-testid="verify-status">
        {state.status === "loading" ? "Consulting the public registry…" : ""}
      </p>

      {state.status === "error" && (
        <p role="alert" className={styles.error}>
          The registry could not be reached. Try again shortly.
        </p>
      )}

      {state.status === "notFound" && (
        <div
          className={`${styles.verdict} ${styles.verdictNotFound}`}
          role="status"
          data-testid="verify-notfound"
        >
          Not found
          <span className={styles.verdictDetail}>
            No certificate with serial {state.serial} exists in the registry.
          </span>
        </div>
      )}

      {state.status === "ok" && verdict && (
        <>
          <div
            className={`${styles.verdict} ${
              verdict === "VALID" ? styles.verdictValid : styles.verdictRevoked
            }`}
            role="status"
            data-testid="verify-verdict"
          >
            {verdict}
            <span className={styles.verdictDetail}>
              {verdict === "VALID" &&
                "The signature recovers to the recorded signer over the certified content."}
              {verdict === "REVOKED" &&
                `Withdrawn by its author${
                  state.data.revokedAt
                    ? ` on ${new Date(state.data.revokedAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}`
                    : ""
                }. The record remains for transparency.`}
              {verdict === "INVALID" &&
                "The stored signature does NOT recover to the recorded signer. Treat this certificate as void."}
            </span>
          </div>

          <article className={styles.deed} data-testid="verify-deed">
            <header className={styles.deedHeader}>
              <div className={styles.microLabel}>Certificate of record</div>
              <h2 className={styles.deedTitle}>{state.data.title}</h2>
              <div className={styles.deedSerial}>{state.data.serial}</div>
            </header>
            <div className={styles.deedGrid}>
              <div className={styles.deedField}>
                <div className={styles.microLabel}>Kind</div>
                <div className={styles.deedValue}>
                  {state.data.kind === "MESSAGE" ? "Signed message" : "Signed document fingerprint"}
                </div>
              </div>
              <div className={styles.deedField}>
                <div className={styles.microLabel}>Issued</div>
                <div className={styles.deedValue}>
                  {new Date(state.data.issuedAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </div>
              <div className={`${styles.deedField} ${styles.deedFieldWide}`}>
                <div className={styles.microLabel}>
                  {state.data.kind === "MESSAGE" ? "Certified message" : "Document name"}
                </div>
                <div className={`${styles.deedValue} ${styles.deedSubject}`}>
                  {state.data.subject}
                </div>
              </div>
              <div className={`${styles.deedField} ${styles.deedFieldWide}`}>
                <div className={styles.microLabel}>Content SHA-256</div>
                <div className={`${styles.deedValue} ${styles.deedValueMono}`}>
                  {state.data.contentHash}
                </div>
              </div>
              <div className={`${styles.deedField} ${styles.deedFieldWide}`}>
                <div className={styles.microLabel}>Signer address</div>
                <div className={`${styles.deedValue} ${styles.deedValueMono}`}>
                  {state.data.signerAddress}
                </div>
              </div>
            </div>
            <p className={styles.standing} data-testid="verify-standing">
              {state.data.signerHeldPassportRecord
                ? "The signer's account held a sealed-passport record in the Republic's registry (a cached record, not a live chain read)."
                : "The signer's account has no sealed-passport record in the Republic's registry."}
            </p>
          </article>

          {state.data.kind === "DOCUMENT" && (
            <section className={styles.rehash} data-testid="verify-rehash">
              <div className={styles.microLabel}>Check a file against this certificate</div>
              <p className={styles.rehashNote}>
                Drop the document here to recompute its SHA-256 locally and compare it with the
                certified fingerprint. This runs entirely in your browser — the file is never
                uploaded.
              </p>
              <label className={styles.fieldLabel} htmlFor="rehash-file" style={{ marginTop: 10 }}>
                Document to check
              </label>
              <input
                id="rehash-file"
                className={styles.fileInput}
                type="file"
                onChange={(e) => void onRehashFile(e)}
                data-testid="rehash-file"
              />
              <p className={styles.match} aria-live="polite" data-testid="rehash-result">
                {hashing && <span>Fingerprinting locally…</span>}
                {!hashing && rehash && (
                  <span
                    className={
                      rehash.hash.toLowerCase() === state.data.contentHash.toLowerCase()
                        ? styles.matchYes
                        : styles.matchNo
                    }
                  >
                    {rehash.hash.toLowerCase() === state.data.contentHash.toLowerCase()
                      ? `MATCH — ${rehash.name} is the certified document.`
                      : `NO MATCH — ${rehash.name} differs from the certified document.`}
                  </span>
                )}
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
