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
import {
  getWalletMode,
  setWalletMode,
  clearWalletMode,
  hasWalletMode,
  type WalletMode,
} from "@/lib/wallet/mode";
import { receiveQrDataUrl } from "@/lib/wallet/receive";
import { UnlockWalletModal } from "./UnlockWalletModal";
import { WalletModeSelect } from "./WalletModeSelect";
import { ImportWalletForm } from "./ImportWalletForm";
import { OfflineSignModal } from "./OfflineSignModal";

const MIN_PASSPHRASE = 12;

const HONEST_WARNING =
  "CryptRepublic can never recover this phrase or reset your vault passphrase; " +
  "anyone who sees it can take everything; we will never ask for it. This is separate " +
  "from your recoverable web-login passphrase.";

// Wave 11 A2: "choose" (mode chooser — only when no vault AND no persisted
// mode), "import" (BIP-39 import), "othermode" (hardware/watch-only chosen —
// those live on the Wallet & Chain screen).
type View = "loading" | "choose" | "othermode" | "create" | "import" | "locked" | "unlocked";

export function WalletApp() {
  const [view, setView] = useState<View>("loading");
  const [accounts, setAccounts] = useState<WalletAccounts | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [showOfflineSign, setShowOfflineSign] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Determine initial view + wire auto-lock. An existing vault user is NEVER
  // blocked by the chooser; the chooser shows only with no vault AND no
  // persisted mode choice.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const exists = await hasVault();
      if (!mounted) return;
      if (exists) {
        setAccounts(await loadPublicAccounts());
        setView(isUnlocked() ? "unlocked" : "locked");
      } else if (await hasWalletMode()) {
        const meta = await getWalletMode();
        if (!mounted) return;
        setView(meta.mode === "embedded" ? "create" : "othermode");
      } else {
        setView("choose");
      }
    })();
    const teardown = startAutoLock();
    return () => {
      mounted = false;
      teardown();
    };
  }, []);

  async function onSelectMode(mode: WalletMode) {
    await setWalletMode({ mode });
    setView(mode === "embedded" ? "create" : "othermode");
  }

  async function onChangeMode() {
    await clearWalletMode();
    setView("choose");
  }

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
        <h1 style={{ marginTop: 12 }}>
          {view === "choose"
            ? "Choose your wallet mode"
            : view === "othermode"
              ? "Wallet mode"
              : "Embedded wallet"}
        </h1>
        {view !== "choose" && view !== "othermode" && (
          <p role="note" style={{ color: "var(--muted)", marginTop: 12, maxWidth: 560 }}>
            {HONEST_WARNING}
          </p>
        )}

        {view === "loading" && <p style={{ marginTop: 24 }}>Loading…</p>}

        {/* MODE CHOOSER (no vault + no persisted choice) */}
        {view === "choose" && (
          <>
            <p style={{ color: "var(--muted)", marginTop: 12, maxWidth: 560 }}>
              Every mode is non-custodial: CryptRepublic never holds keys and never signs.
            </p>
            <WalletModeSelect onSelect={onSelectMode} />
          </>
        )}

        {/* HARDWARE / WATCH-ONLY chosen — those modes live on the dashboard screen */}
        {view === "othermode" && (
          <div style={{ marginTop: 24 }}>
            <p style={{ color: "var(--muted)", maxWidth: 560 }}>
              Hardware/external and watch-only wallets are managed on the Wallet &amp; Chain screen.
            </p>
            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a className="btn btn-primary" href="/dashboard/wallet">
                Open Wallet &amp; Chain
              </a>
              <button className="btn" type="button" onClick={onChangeMode}>
                Change wallet mode
              </button>
            </div>
          </div>
        )}

        {/* IMPORT */}
        {view === "import" && (
          <>
            <ImportWalletForm
              onImported={(acc) => {
                setAccounts(acc);
                setView("unlocked");
              }}
            />
            <p style={{ marginTop: 16 }}>
              <button className="btn" type="button" onClick={() => setView("create")}>
                Create a new wallet instead
              </button>
            </p>
          </>
        )}

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
            <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create wallet"}
              </button>
              <button className="btn" type="button" onClick={() => setView("import")}>
                Import an existing wallet instead
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
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn" type="button" onClick={onLock}>
                Lock
              </button>
              <button
                className="btn"
                type="button"
                data-testid="offline-sign-open"
                onClick={() => setShowOfflineSign(true)}
              >
                Scan a request to sign (air-gapped)
              </button>
            </div>

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
        {showOfflineSign && <OfflineSignModal onClose={() => setShowOfflineSign(false)} />}
      </div>
    </section>
  );
}
