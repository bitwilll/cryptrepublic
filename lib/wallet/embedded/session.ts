import "client-only";
import type { Account } from "viem";
import { activeChain } from "@/lib/config/chain";
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToEntropy,
  entropyToMnemonic,
  mnemonicToSeed,
} from "./mnemonic";
import { deriveEvm, deriveSolana, deriveBitcoin, evmSigner } from "./derive";
import { encryptEntropy, decryptEntropy, type VaultBlob } from "./vault";
import { saveVault, loadVault, hasVault } from "./storage";

/**
 * The single owner of unlocked key material. Secrets live ONLY in this
 * module-scoped state as `Uint8Array` (never React/Redux state, localStorage,
 * URLs, or logs) and are `.fill(0)`-zeroized on lock.
 *
 * Honest limitation: JavaScript provides no guaranteed zeroization (immutable
 * strings, GC copies, heap moves) and no defense against XSS while unlocked; we
 * minimize secret lifetime and surface area only.
 */

export interface WalletAccounts {
  evm: string;
  solana: string;
  bitcoin: string;
}

export interface CreateResult {
  mnemonic: string; // shown ONCE at creation
  accounts: WalletAccounts;
}

// --- module-scoped mutable secret state ---
let unlockedSeed: Uint8Array | null = null;
let cachedAccounts: WalletAccounts | null = null;

function deriveAllAccounts(seed: Uint8Array): WalletAccounts {
  return {
    evm: deriveEvm(seed).address,
    solana: deriveSolana(seed).address,
    bitcoin: deriveBitcoin(seed, activeChain().bitcoinNetwork).address,
  };
}

export async function createWallet(passphrase: string, label = "Primary"): Promise<CreateResult> {
  const mnemonic = generateMnemonic(256);
  const entropy = mnemonicToEntropy(mnemonic);
  const seed = await mnemonicToSeed(mnemonic);
  const accounts = deriveAllAccounts(seed);
  const blob = await encryptEntropy(entropy, passphrase, accounts, label);
  await saveVault(blob);
  entropy.fill(0);
  unlockedSeed = seed;
  cachedAccounts = accounts;
  return { mnemonic, accounts };
}

export interface ImportResult {
  accounts: WalletAccounts; // NO mnemonic returned — the user already has it
}

/**
 * Import an existing BIP-39 vault (Wave 11 A1). Validates the phrase BEFORE
 * any derivation (invalid -> throw, no vault written), then mirrors
 * createWallet byte-for-byte: entropy -> seed -> deriveAllAccounts ->
 * encryptEntropy -> saveVault -> unlockedSeed. Overwriting an existing
 * "primary" vault is the CALLER's explicit, confirmed choice (overwrite=true)
 * — never a silent clobber.
 */
export async function importWallet(
  passphrase: string,
  mnemonic: string,
  label = "Primary",
  overwrite = false,
): Promise<ImportResult> {
  // Normalize pasted phrases (stray spacing / case) — English BIP-39 is lowercase.
  const phrase = mnemonic.trim().replace(/\s+/g, " ").toLowerCase();
  if (!validateMnemonic(phrase)) {
    throw new Error("Invalid recovery phrase. Check the words and try again.");
  }
  if (!overwrite && (await hasVault())) {
    throw new Error("A wallet already exists. Confirm overwrite to import a new one.");
  }
  const entropy = mnemonicToEntropy(phrase);
  const seed = await mnemonicToSeed(phrase);
  const accounts = deriveAllAccounts(seed);
  const blob = await encryptEntropy(entropy, passphrase, accounts, label);
  await saveVault(blob);
  entropy.fill(0);
  unlockedSeed = seed;
  cachedAccounts = accounts;
  return { accounts };
}

export async function unlock(passphrase: string): Promise<WalletAccounts> {
  const blob = await loadVault();
  if (!blob) throw new Error("No vault to unlock.");
  const entropy = await decryptEntropy(blob, passphrase); // throws WalletUnlockError on wrong pass
  const mnemonic = entropyToMnemonic(entropy);
  const seed = await mnemonicToSeed(mnemonic);
  entropy.fill(0);
  const accounts = deriveAllAccounts(seed);
  unlockedSeed = seed;
  cachedAccounts = accounts;
  return accounts;
}

export function lock(): void {
  unlockedSeed?.fill(0);
  unlockedSeed = null;
  // cachedAccounts are PUBLIC — keep them so a locked UI can still show addresses.
}

export function isUnlocked(): boolean {
  return unlockedSeed !== null;
}

/** Public addresses, available even while locked (loaded from the blob). */
export function getAccounts(): WalletAccounts | null {
  return cachedAccounts;
}

/** Populate cachedAccounts from the persisted blob without unlocking. */
export async function loadPublicAccounts(): Promise<WalletAccounts | null> {
  if (cachedAccounts) return cachedAccounts;
  const blob: VaultBlob | undefined = await loadVault();
  if (!blob) return null;
  cachedAccounts = { ...blob.addresses };
  return cachedAccounts;
}

/** Fresh decrypt to reveal the recovery phrase (requires the passphrase). */
export async function revealMnemonic(passphrase: string): Promise<string> {
  const blob = await loadVault();
  if (!blob) throw new Error("No vault to reveal.");
  const entropy = await decryptEntropy(blob, passphrase);
  const mnemonic = entropyToMnemonic(entropy);
  entropy.fill(0);
  return mnemonic;
}

/**
 * Run `fn` with a transient viem EVM Account derived from the unlocked seed.
 * Unlock-gated. The transient signer handle is dropped after use (JS gives no
 * hard zeroization of the underlying key inside viem's Account).
 */
export async function withEvmSigner<T>(fn: (account: Account) => Promise<T>): Promise<T> {
  if (!unlockedSeed) throw new Error("Wallet is locked. Re-unlock to sign.");
  const account = evmSigner(unlockedSeed);
  return fn(account);
}

/** The unlocked seed for transient signer derivation (send layer). Locked -> throw. */
export function requireSeed(): Uint8Array {
  if (!unlockedSeed) throw new Error("Wallet is locked. Re-unlock to sign.");
  return unlockedSeed;
}

/**
 * Auto-lock: locks on inactivity, tab hidden (past a short grace), and tab
 * close. Guarded behind `typeof window` so node-env tests (fake-indexeddb only
 * shims indexedDB) never dereference an undefined window. Returns a teardown.
 */
export function startAutoLock(inactivityMs = 600_000): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  const reset = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => lock(), inactivityMs);
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      graceTimer = setTimeout(() => lock(), 5_000);
    } else if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = undefined;
    }
  };
  const onHide = () => lock();

  const activity: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click"];
  activity.forEach((e) => window.addEventListener(e, reset, { passive: true }));
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onHide);
  reset();

  return () => {
    if (timer) clearTimeout(timer);
    if (graceTimer) clearTimeout(graceTimer);
    activity.forEach((e) => window.removeEventListener(e, reset));
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onHide);
  };
}
