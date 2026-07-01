"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SiweMessage } from "siwe";
import { createWalletClient, custom, getAddress } from "viem";
import styles from "./auth.module.css";

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

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("in");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [badName, setBadName] = useState(false);
  const [badEmail, setBadEmail] = useState(false);
  const [badPass, setBadPass] = useState(false);

  const [lines, setLines] = useState<LogLine[]>([
    { text: "> cr-auth v2.6 · awaiting credentials…", tone: "dim" },
  ]);

  const signin = mode === "in";
  const log = (next: LogLine[]) => setLines(next);

  function switchMode(m: Mode) {
    setMode(m);
    setBadName(false);
    setBadEmail(false);
    setBadPass(false);
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
    setBadName(!nameOk);
    setBadEmail(!emailOk);
    setBadPass(!passOk);
    if (!nameOk || !emailOk || !passOk) {
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
      const body = signin ? { email, passphrase: pass } : { name, email, passphrase: pass };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
      if (!res.ok) {
        log([
          { text: `> ${data.error ?? "request failed"}`, tone: "dim" },
          { text: "> authentication rejected", tone: "dim" },
        ]);
        setBusy(false);
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
              <span
                className={styles.glyph}
                style={
                  w.name === "Ledger"
                    ? { background: w.glyphBg, border: "1px solid var(--line)" }
                    : { background: w.glyphBg }
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
          <button
            className={`${styles.submit} ${signin ? "" : styles.gold}`}
            type="submit"
            disabled={busy}
          >
            {signin ? "AUTHENTICATE →" : "CREATE RECORD & PROCEED TO MINT →"}
          </button>
        </form>

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
