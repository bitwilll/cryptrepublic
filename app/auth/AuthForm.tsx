"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiweMessage } from "siwe";
import { createWalletClient, custom, getAddress } from "viem";
import { startAuthentication } from "@simplewebauthn/browser";
import { QrLoginPanel } from "@/components/auth/QrLoginPanel";
import styles from "./auth.module.css";
import { fetchFlags } from "@/lib/flags/client";
import {
  flagValue,
  registrationPolicyFromFlags,
  type RegistrationPolicy,
} from "@/lib/flags/defaults";

type Mode = "in" | "up";

interface LogLine {
  text: string;
  tone?: "dim" | "gold" | "green";
}

const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ENV === "mainnet" ? 8453 : 84532;

const WALLETS: { name: string; glyph: string; glyphBg: string; sub: string }[] = [
  { name: "MetaMask", glyph: "MM", glyphBg: "#e2761b", sub: "Browser signature · EIP-4361" },
  { name: "WalletConnect", glyph: "WC", glyphBg: "#3b99fc", sub: "Scan from any mobile wallet" },
  { name: "Ledger", glyph: "LD", glyphBg: "#0a1929", sub: "Hardware signature · cold seal" },
];

function toneClass(tone?: LogLine["tone"]): string | undefined {
  if (tone === "dim") return styles.dim;
  if (tone === "gold") return styles.gold;
  return undefined; // default green (.console color)
}

export function AuthForm({ refCode: initialRefCode }: { refCode?: string } = {}) {
  const router = useRouter();
  // Wave 17 — a ?ref=<code> arrival opens on REGISTER and pins the code so it
  // rides the register POST body (silently ignored server-side when invalid).
  // Under the Cabinet's REFERRAL_ONLY policy the code becomes a REQUIRED,
  // editable field; under CLOSED the register pane is replaced by a notice.
  // The server (register route + SIWE) is the enforcement authority — this
  // form only mirrors the policy.
  const [refCode, setRefCode] = useState(initialRefCode ?? "");
  const [policy, setPolicy] = useState<RegistrationPolicy>("OPEN");
  const [mode, setMode] = useState<Mode>(initialRefCode ? "up" : "in");
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [twoFactorPending, setTwoFactorPending] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [badName, setBadName] = useState(false);
  const [badEmail, setBadEmail] = useState(false);
  const [badPass, setBadPass] = useState(false);
  const [badRef, setBadRef] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchFlags().then((flags) => {
      if (!alive) return;
      const eff = (key: string) => (key in flags ? flags[key] : flagValue(key));
      setPolicy(
        registrationPolicyFromFlags(eff("registration_open"), eff("registration_referral_only")),
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  const [lines, setLines] = useState<LogLine[]>(
    refCode
      ? [
          { text: "> cr-auth v2.6 · awaiting credentials…", tone: "dim" },
          { text: `> referral code ${refCode} on file · binds on registration`, tone: "gold" },
        ]
      : [{ text: "> cr-auth v2.6 · awaiting credentials…", tone: "dim" }],
  );

  const signin = mode === "in";
  const log = (next: LogLine[]) => setLines(next);

  function switchMode(m: Mode) {
    setMode(m);
    setBadName(false);
    setBadEmail(false);
    setBadPass(false);
    setBadRef(false);
    log([
      {
        text: `> mode: ${m === "in" ? "SIGN-IN" : "REGISTRATION"} · awaiting credentials…`,
        tone: "dim",
      },
    ]);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const nameOk = signin ? true : name.trim().length > 1;
    const emailOk = /.+@.+\..+/.test(email);
    const passOk = pass.length >= 12;
    const refOk = signin || policy !== "REFERRAL_ONLY" || refCode.trim().length > 0;
    setBadName(!nameOk);
    setBadEmail(!emailOk);
    setBadPass(!passOk);
    setBadRef(!refOk);
    if (!nameOk || !emailOk || !passOk || !refOk) {
      log([{ text: "> validation failed · correct the fields marked in red", tone: "dim" }]);
      return;
    }

    setBusy(true);
    log([
      {
        text: signin ? "> verifying e-mail of record…" : "> creating citizen record…",
        tone: "dim",
      },
    ]);
    try {
      const endpoint = signin ? "/api/auth/login" : "/api/auth/register";
      const body = signin
        ? { email, passphrase: pass }
        : { name, email, passphrase: pass, ...(refCode.trim() ? { refCode: refCode.trim() } : {}) };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        next?: string;
        error?: string;
        twoFactor?: boolean;
      };
      if (!res.ok) {
        log([
          { text: `> ${data.error ?? "request failed"}`, tone: "dim" },
          { text: "> authentication rejected", tone: "dim" },
        ]);
        setBusy(false);
        return;
      }
      // Wave 14 — require-passkey step-up: a correct password did NOT issue a
      // session; the account requires a passkey to finish. Prompt the ceremony
      // (a fresh user gesture keeps the WebAuthn call reliable across browsers).
      if (data.twoFactor) {
        setTwoFactorPending(true);
        setBusy(false);
        log([
          { text: "> password verified · passkey required", tone: "gold" },
          { text: "> finish with your passkey below", tone: "dim" },
        ]);
        return;
      }
      log([
        {
          text: signin
            ? "> session sealed · citizen record located ✓"
            : "> record created · passport not yet minted",
          tone: "gold",
        },
        { text: "> redirecting…", tone: "dim" },
      ]);
      router.push(data.next ?? (signin ? "/dashboard" : "/dashboard/mint"));
    } catch {
      log([{ text: "> network error · could not reach the Republic", tone: "dim" }]);
      setBusy(false);
    }
  }

  async function connectWallet(walletName: string) {
    if (busy) return;
    if (typeof window === "undefined" || !window.ethereum) {
      log([
        {
          text: "> no injected wallet detected — install MetaMask or use e-mail;",
          tone: "dim",
        },
        {
          text: "> full WalletConnect/Ledger support arrives in Wave 3",
          tone: "dim",
        },
      ]);
      return;
    }

    setBusy(true);
    log([{ text: `> requesting ${walletName} session…`, tone: "dim" }]);
    try {
      const provider = window.ethereum;
      const walletClient = createWalletClient({ transport: custom(provider) });
      const [rawAddress] = await walletClient.requestAddresses();
      const address = getAddress(rawAddress);

      const nonceRes = await fetch("/api/auth/siwe/nonce", { credentials: "same-origin" });
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to CryptRepublic.",
        uri: window.location.origin,
        version: "1",
        chainId: CHAIN_ID,
        nonce,
        issuedAt: new Date().toISOString(),
      }).prepareMessage();
      log([
        { text: `> requesting ${walletName} session…`, tone: "dim" },
        { text: "> EIP-4361 message issued", tone: "dim" },
      ]);

      const signature = await walletClient.signMessage({
        account: address,
        message,
      });

      const verifyRes = await fetch("/api/auth/siwe/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ message, signature }),
      });
      const data = (await verifyRes.json().catch(() => ({}))) as {
        next?: string;
        address?: string;
        error?: string;
      };
      if (!verifyRes.ok) {
        log([{ text: `> ${data.error ?? "signature rejected"}`, tone: "dim" }]);
        setBusy(false);
        return;
      }
      log([
        { text: `> signature verified · ${data.address ?? address}`, tone: "green" },
        { text: "> session sealed ✓", tone: "gold" },
        { text: "> redirecting…", tone: "dim" },
      ]);
      router.push(data.next ?? "/dashboard");
    } catch {
      log([{ text: "> wallet request cancelled or failed", tone: "dim" }]);
      setBusy(false);
    }
  }

  // Passkey (WebAuthn) sign-in — both the standalone passwordless path and the
  // completion of a require-passkey step-up. Usernameless: the browser offers
  // the account's discoverable passkeys; identity comes from the credential.
  async function passkeyLogin() {
    if (busy) return;
    setBusy(true);
    log([{ text: "> requesting passkey…", tone: "dim" }]);
    try {
      const optRes = await fetch("/api/auth/webauthn/login/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: "{}",
      });
      if (!optRes.ok) throw new Error("Could not start a passkey sign-in.");
      const { options } = (await optRes.json()) as {
        options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
      };
      const assertion = await startAuthentication({ optionsJSON: options });
      const verRes = await fetch("/api/auth/webauthn/login/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ response: assertion }),
      });
      const data = (await verRes.json().catch(() => ({}))) as { next?: string; error?: string };
      if (!verRes.ok) throw new Error(data.error ?? "Passkey sign-in failed.");
      log([
        { text: "> passkey verified · session sealed ✓", tone: "gold" },
        { text: "> redirecting…", tone: "dim" },
      ]);
      router.push(data.next ?? "/dashboard");
    } catch (e) {
      log([
        { text: `> ${e instanceof Error ? e.message : "passkey sign-in cancelled"}`, tone: "dim" },
      ]);
      setBusy(false);
    }
  }

  return (
    <div className={styles.formCard}>
      <div className={styles.fcHead}>
        <div className={styles.fcKicker}>FORM CR-AUTH-01</div>
        <h2>{signin ? "Sign in to the Republic" : "Register as a citizen"}</h2>
      </div>

      <div className={styles.tabs} role="tablist">
        <button
          className={signin ? styles.on : undefined}
          role="tab"
          aria-selected={signin}
          type="button"
          onClick={() => switchMode("in")}
        >
          SIGN IN
        </button>
        <button
          className={!signin ? styles.on : undefined}
          role="tab"
          aria-selected={!signin}
          type="button"
          onClick={() => switchMode("up")}
        >
          REGISTER
        </button>
      </div>

      <div className={styles.fcBody}>
        {!signin && policy === "CLOSED" ? (
          <div
            data-testid="registrations-closed"
            role="status"
            style={{
              border: "1px solid var(--gold)",
              borderLeft: "3px solid var(--gold)",
              background: "rgba(200, 169, 106, 0.12)",
              padding: "18px 20px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: "var(--gold-ink)",
              }}
            >
              REGISTRATIONS SUSPENDED
            </div>
            <p style={{ marginTop: 8, fontSize: 14, color: "var(--ink)" }}>
              By order of the Cabinet, new citizen registrations are currently closed. Sign-in for
              existing citizens remains open.
            </p>
          </div>
        ) : (
          <>
            <p className={styles.secLabel}>
              {signin ? "WITH SOVEREIGN WALLET" : "REGISTER WITH WALLET"}
            </p>
            <div className={styles.wallets}>
              {WALLETS.map((w) => (
                <button
                  key={w.name}
                  className={styles.wallet}
                  type="button"
                  onClick={() => connectWallet(w.name)}
                >
                  {/* Monogram color per background (Wave 8 A2): the module's white
                  text fails WCAG AA on the orange/blue brand tiles (3.1:1 /
                  2.9:1 at 12px); var(--ink) measures 5.4:1 / 5.7:1. Ledger's
                  white-on-navy passes (>14:1) and keeps the default. */}
                  <span
                    className={styles.glyph}
                    style={
                      w.name === "Ledger"
                        ? { background: w.glyphBg, border: "1px solid var(--line)" }
                        : { background: w.glyphBg, color: "var(--ink)" }
                    }
                  >
                    {w.glyph}
                  </span>
                  <span>
                    <b>{w.name}</b>
                    <span>{w.sub}</span>
                  </span>
                  <span className={styles.go}>CONNECT →</span>
                </button>
              ))}
            </div>

            {signin && (
              <div style={{ marginTop: 12 }}>
                {twoFactorPending ? (
                  <div data-testid="passkey-2fa-section">
                    <button
                      className={styles.wallet}
                      type="button"
                      data-testid="passkey-2fa-complete"
                      onClick={passkeyLogin}
                      disabled={busy}
                      style={{ width: "100%" }}
                    >
                      <span className={styles.glyph} style={{ background: "#0a1929" }}>
                        ⚿
                      </span>
                      <span>
                        <b>Finish with your passkey</b>
                        <span>This account requires a passkey to complete sign-in</span>
                      </span>
                      <span className={styles.go}>UNLOCK →</span>
                    </button>
                  </div>
                ) : showQr ? (
                  <div data-testid="qr-login-section">
                    <QrLoginPanel />
                    <div style={{ textAlign: "center", marginTop: 10 }}>
                      <button
                        type="button"
                        className={styles.swap}
                        onClick={() => setShowQr(false)}
                      >
                        ← Back to other sign-in options
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      className={styles.wallet}
                      type="button"
                      data-testid="passkey-login-open"
                      onClick={passkeyLogin}
                      disabled={busy}
                      style={{ width: "100%" }}
                    >
                      <span className={styles.glyph} style={{ background: "#0a1929" }}>
                        ⚿
                      </span>
                      <span>
                        <b>Sign in with a passkey</b>
                        <span>Touch ID, Face ID, or a security key — no password</span>
                      </span>
                      <span className={styles.go}>USE →</span>
                    </button>
                    <button
                      className={styles.wallet}
                      type="button"
                      data-testid="qr-login-open"
                      onClick={() => setShowQr(true)}
                      style={{ width: "100%", marginTop: 8 }}
                    >
                      <span className={styles.glyph} style={{ background: "#0a1929" }}>
                        QR
                      </span>
                      <span>
                        <b>Wallet-QR sign-in</b>
                        <span>Scan with a device where your wallet is unlocked</span>
                      </span>
                      <span className={styles.go}>SCAN →</span>
                    </button>
                  </>
                )}
              </div>
            )}

            <div className={styles.divider}>OR WITH E-MAIL</div>

            <form onSubmit={submitEmail} noValidate>
              {!signin && (
                <div className={`${styles.field} ${badName ? styles.bad : ""}`}>
                  <label htmlFor="inName">FULL OR CHOSEN NAME</label>
                  <input
                    id="inName"
                    type="text"
                    autoComplete="name"
                    placeholder="A. Nakadai"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <div className={styles.err}>› NAME IS REQUIRED FOR THE CITIZEN RECORD</div>
                </div>
              )}
              <div className={`${styles.field} ${badEmail ? styles.bad : ""}`}>
                <label htmlFor="inEmail">E-MAIL OF RECORD</label>
                <input
                  id="inEmail"
                  type="email"
                  autoComplete="email"
                  placeholder="citizen@example.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <div className={styles.err}>› ENTER A VALID E-MAIL ADDRESS</div>
              </div>
              <div className={`${styles.field} ${badPass ? styles.bad : ""}`}>
                <label htmlFor="inPass">{signin ? "PASSPHRASE" : "CHOOSE A PASSPHRASE"}</label>
                <input
                  id="inPass"
                  type="password"
                  autoComplete={signin ? "current-password" : "new-password"}
                  placeholder="••••••••••••"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                />
                <div className={styles.err}>› PASSPHRASE MUST BE AT LEAST 12 CHARACTERS</div>
              </div>
              {!signin && policy === "REFERRAL_ONLY" && (
                <div className={`${styles.field} ${badRef ? styles.bad : ""}`}>
                  <label htmlFor="inRef">REFERRAL CODE — REQUIRED BY ORDER OF THE CABINET</label>
                  <input
                    id="inRef"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="from a citizen's referral link"
                    value={refCode}
                    onChange={(e) => setRefCode(e.target.value)}
                    style={{ fontFamily: "var(--mono)" }}
                    data-testid="register-ref-code"
                  />
                  <div className={styles.err}>› A REFERRAL CODE FROM A CITIZEN IS REQUIRED</div>
                </div>
              )}
              {/* Busy state (Wave 8 A3): visible label swap + aria-busy while a
              submission is in flight. The IDLE labels must keep matching
              e2e/auth.spec.ts's /AUTHENTICATE/i and /MINT/i clicks. */}
              <button
                className={`${styles.submit} ${signin ? "" : styles.gold}`}
                type="submit"
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy
                  ? signin
                    ? "AUTHENTICATING…"
                    : "TRANSMITTING…"
                  : signin
                    ? "AUTHENTICATE →"
                    : "CREATE RECORD & PROCEED TO MINT →"}
              </button>
            </form>
          </>
        )}

        <div className={styles.console} role="log" aria-live="polite">
          {lines.map((l, i) => (
            <span key={i} className={toneClass(l.tone)}>
              {l.text}
              {i < lines.length - 1 ? <br /> : null}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.fcFoot}>
        <span>
          {signin ? "No record yet? " : "Already a citizen? "}
          <button
            type="button"
            className={styles.swap}
            onClick={() => switchMode(signin ? "up" : "in")}
          >
            {signin ? "Register & mint a passport" : "Sign in instead"}
          </button>
        </span>
        <span>
          <a href="#">Recover via 7 witnesses</a>
        </span>
      </div>
    </div>
  );
}
