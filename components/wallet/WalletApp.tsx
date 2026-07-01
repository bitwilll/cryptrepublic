"use client";
import { useEffect, useState } from "react";
import {
  createWallet,
  unlock,
  lock,
  isUnlocked,
  getAccounts,
  loadPublicAccounts,
  revealMnemonic,
  startAutoLock,
  type WalletAccounts,
} from "@/lib/wallet/embedded/session";
import { hasVault } from "@/lib/wallet/embedded/storage";
import { receiveQrDataUrl } from "@/lib/wallet/receive";
import { UnlockWalletModal } from "./UnlockWalletModal";

const MIN_PASSPHRASE = 12;

const HONEST_WARNING =
  "CryptRepublic can never recover this phrase or reset your vault passphrase; " +
  "anyone who sees it can take everything; we will never ask for it. This is separate " +
  "from your recoverable web-login passphrase.";

type View = "loading" | "create" | "locked" | "unlocked";

export function WalletApp() {
  const [view, setView] = useState<View>("loading");
  const [accounts, setAccounts] = useState<WalletAccounts | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Determine initial view + wire auto-lock.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const exists = await hasVault();
      if (!mounted) return;
      if (exists) {
        setAccounts(await loadPublicAccounts());
        setView(isUnlocked() ? "unlocked" : "locked");
      } else {
        setView("create");
      }
    })();
    const teardown = startAutoLock();
    return () => {
      mounted = false;
      teardown();
    };
  }, []);

  // Render a receive QR for the EVM address whenever accounts are known.
  useEffect(() => {
    if (accounts?.evm) {
      receiveQrDataUrl(accounts.evm)
        .then(setQr)
        .catch(() => setQr(null));
    }
  }, [accounts?.evm]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (passphrase.length < MIN_PASSPHRASE) {
      setCreateError(`Passphrase must be at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    setBusy(true);
    try {
      const { mnemonic: phrase, accounts: acc } = await createWallet(passphrase);
      setMnemonic(phrase);
      setAccounts(acc);
      setPassphrase("");
    } catch {
      setCreateError("Wallet creation failed.");
    } finally {
      setBusy(false);
    }
  }

  function confirmBackedUp() {
    setMnemonic(null);
    setBackedUp(true);
    setView("unlocked");
  }

  async function onUnlock(pass: string) {
    const acc = await unlock(pass); // throws WalletUnlockError on wrong pass
    setAccounts(acc);
    setShowUnlock(false);
    setView("unlocked");
  }

  function onLock() {
    lock();
    setRevealed(null);
    setView("locked");
  }

  async function onReveal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const phrase = await revealMnemonic(passphrase);
      setRevealed(phrase);
      setPassphrase("");
    } catch {
      setRevealed(null);
      setCreateError("Reveal failed — check your passphrase.");
    } finally {
      setBusy(false);
    }
  }

  const addr = accounts ?? getAccounts();

  return (
    <section className="block">
      <div className="wrap" style={{ maxWidth: 720 }}>
        <div className="kicker">SOVEREIGN WALLET</div>
        <h1 style={{ marginTop: 12 }}>Embedded wallet</h1>
        <p role="note" style={{ color: "var(--muted)", marginTop: 12, maxWidth: 560 }}>
          {HONEST_WARNING}
        </p>

        {view === "loading" && <p style={{ marginTop: 24 }}>Loading…</p>}

        {/* CREATE */}
        {view === "create" && !mnemonic && (
          <form onSubmit={onCreate} style={{ marginTop: 24 }}>
            <label htmlFor="create-pass" style={{ display: "block", marginBottom: 8 }}>
              Choose a vault passphrase (min {MIN_PASSPHRASE} characters)
            </label>
            <input
              id="create-pass"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="off"
              style={{
                width: "100%",
                maxWidth: 420,
                padding: 10,
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
            />
            {createError && (
              <p role="alert" style={{ color: "#b00020", marginTop: 12 }}>
                {createError}
              </p>
            )}
            <div style={{ marginTop: 20 }}>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create wallet"}
              </button>
            </div>
          </form>
        )}

        {/* MNEMONIC SHOWN ONCE (non-dismissible until backed up) */}
        {mnemonic && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Back up your recovery phrase"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,31,51,0.85)",
              display: "grid",
              placeItems: "center",
              zIndex: 60,
              padding: 16,
            }}
          >
            <div
              style={{
                background: "#fff",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 24,
                width: "min(560px, 96vw)",
              }}
            >
              <h2 style={{ marginTop: 0, color: "#b00020" }}>Write this down. Shown once.</h2>
              <p style={{ color: "var(--muted)" }}>{HONEST_WARNING}</p>
              <pre
                data-testid="mnemonic"
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: "#f6f8fa",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 16,
                  fontFamily: "var(--font-plex-mono), monospace",
                }}
              >
                {mnemonic}
              </pre>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={backedUp}
                  onChange={(e) => setBackedUp(e.target.checked)}
                />
                I have safely backed up my recovery phrase offline.
              </label>
              <div style={{ marginTop: 20 }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={confirmBackedUp}
                  disabled={!backedUp}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LOCKED */}
        {view === "locked" && (
          <div style={{ marginTop: 24 }}>
            <p data-testid="wallet-state">Wallet is locked.</p>
            <button className="btn btn-primary" type="button" onClick={() => setShowUnlock(true)}>
              Unlock
            </button>
          </div>
        )}

        {/* UNLOCKED */}
        {view === "unlocked" && (
          <div style={{ marginTop: 24 }}>
            <p data-testid="wallet-state">Wallet is unlocked.</p>
            <button className="btn" type="button" onClick={onLock}>
              Lock
            </button>

            <form onSubmit={onReveal} style={{ marginTop: 24 }}>
              <label htmlFor="reveal-pass" style={{ display: "block", marginBottom: 8 }}>
                Reveal recovery phrase (re-enter passphrase)
              </label>
              <input
                id="reveal-pass"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="off"
                style={{
                  width: "100%",
                  maxWidth: 420,
                  padding: 10,
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              />
              <div style={{ marginTop: 12 }}>
                <button className="btn" type="submit" disabled={busy}>
                  Reveal
                </button>
              </div>
              {createError && (
                <p role="alert" style={{ color: "#b00020", marginTop: 12 }}>
                  {createError}
                </p>
              )}
              {revealed && (
                <pre
                  data-testid="revealed-mnemonic"
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "#f6f8fa",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: 16,
                    marginTop: 12,
                    fontFamily: "var(--font-plex-mono), monospace",
                  }}
                >
                  {revealed}
                </pre>
              )}
            </form>
          </div>
        )}

        {/* ADDRESSES + RECEIVE QR (public — shown whenever known) */}
        {addr && (
          <div style={{ marginTop: 32 }}>
            <h2>Addresses</h2>
            <dl style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 13 }}>
              <dt style={{ color: "var(--muted)" }}>EVM</dt>
              <dd data-testid="addr-evm" style={{ margin: "0 0 12px", wordBreak: "break-all" }}>
                {addr.evm}
              </dd>
              <dt style={{ color: "var(--muted)" }}>Solana</dt>
              <dd data-testid="addr-solana" style={{ margin: "0 0 12px", wordBreak: "break-all" }}>
                {addr.solana}
              </dd>
              <dt style={{ color: "var(--muted)" }}>Bitcoin</dt>
              <dd data-testid="addr-bitcoin" style={{ margin: "0 0 12px", wordBreak: "break-all" }}>
                {addr.bitcoin}
              </dd>
            </dl>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img data-testid="receive-qr" src={qr} alt="Receive address QR code" width={200} />
            )}
          </div>
        )}

        {showUnlock && (
          <UnlockWalletModal onUnlock={onUnlock} onCancel={() => setShowUnlock(false)} />
        )}
      </div>
    </section>
  );
}
