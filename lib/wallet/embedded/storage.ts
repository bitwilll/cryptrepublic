import "client-only";
import { openDB, type IDBPDatabase } from "idb";
import type { VaultBlob } from "./vault";

/**
 * IndexedDB persistence for the encrypted vault. The blob contains only
 * ciphertext + public addresses + non-secret KDF params — nothing here is ever
 * transmitted to the server. Single active vault id "primary" in v1.
 * v2 (Wave 11 A2) adds the `meta` store (wallet mode + watch-only address —
 * PUBLIC metadata only, never a secret) in the SAME upgrade path; one openDB
 * per app — lib/wallet/mode.ts owns the meta records via openWalletDb().
 */

const DB_NAME = "cryptrepublic";
const DB_VERSION = 2;
const STORE = "vaults";
export const META_STORE = "meta";
const DEFAULT_ID = "primary";

interface StoredVault extends VaultBlob {
  id: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/** The shared wallet DB handle (vaults + meta) — for lib/wallet/mode.ts. */
export function openWalletDb(): Promise<IDBPDatabase> {
  return db();
}

export async function saveVault(blob: VaultBlob, id: string = DEFAULT_ID): Promise<void> {
  const record: StoredVault = { id, ...blob };
  await (await db()).put(STORE, record);
}

export async function loadVault(id: string = DEFAULT_ID): Promise<VaultBlob | undefined> {
  const record = (await (await db()).get(STORE, id)) as StoredVault | undefined;
  if (!record) return undefined;
  const { id: _id, ...blob } = record;
  return blob;
}

export async function hasVault(id: string = DEFAULT_ID): Promise<boolean> {
  const key = await (await db()).getKey(STORE, id);
  return key !== undefined;
}

export async function deleteVault(id: string = DEFAULT_ID): Promise<void> {
  await (await db()).delete(STORE, id);
}
