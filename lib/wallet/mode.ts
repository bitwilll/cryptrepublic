import "client-only";
import { openWalletDb, META_STORE } from "./embedded/storage";

/**
 * Persisted wallet MODE (Wave 11 A2) — which of the three non-custodial modes
 * this device uses: embedded vault, hardware/external (wagmi), or watch-only
 * (public address + air-gapped QR signing). Stored as PUBLIC metadata in the
 * `meta` store of the shared wallet IndexedDB (same DB as the vault, separate
 * store — one openDB upgrade path). Never a secret: the watch-only record
 * holds a public address only.
 *
 * Default (no record) is `embedded` so an existing vault user is never
 * blocked by the chooser.
 */
// TODO(follow-up): Solana / BTC watch-only + air-gapped signing — the MVP is EVM-only.
export type WalletMode = "embedded" | "hardware" | "watchonly";

export interface WalletModeMeta {
  mode: WalletMode;
  watchAddress?: `0x${string}`;
}

const META_ID = "wallet";

export async function getWalletMode(): Promise<WalletModeMeta> {
  const record = (await (await openWalletDb()).get(META_STORE, META_ID)) as
    | ({ id: string } & WalletModeMeta)
    | undefined;
  if (!record) return { mode: "embedded" };
  const meta: WalletModeMeta = { mode: record.mode };
  if (record.watchAddress) meta.watchAddress = record.watchAddress;
  return meta;
}

/** Whether the user has EXPLICITLY chosen a mode (drives chooser visibility). */
export async function hasWalletMode(): Promise<boolean> {
  const key = await (await openWalletDb()).getKey(META_STORE, META_ID);
  return key !== undefined;
}

export async function setWalletMode(meta: WalletModeMeta): Promise<void> {
  await (await openWalletDb()).put(META_STORE, { id: META_ID, ...meta });
}

/** Forget the choice — back to the chooser (the vault store is untouched). */
export async function clearWalletMode(): Promise<void> {
  await (await openWalletDb()).delete(META_STORE, META_ID);
}
