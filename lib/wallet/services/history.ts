import "client-only";

/**
 * Tx history adapters. EVM history comes from the Etherscan v2 proxy
 * (`/api/history/<chainId>`); BTC from the Esplora proxy (`/api/btc/...`).
 * Direction is derived by comparing the queried address to `from`/`to`.
 */
export interface TxRow {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  direction: "in" | "out";
}

interface EtherscanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
}

interface EtherscanResponse {
  status?: string;
  message?: string;
  result?: EtherscanTx[] | string;
}

/** EVM tx history for `address` on `chainId` via the Etherscan v2 proxy. */
export async function evmHistory(chainId: number, address: string): Promise<TxRow[]> {
  const res = await fetch(`/api/history/${chainId}?address=${encodeURIComponent(address)}`);
  const json = (await res.json()) as EtherscanResponse;
  const rows = Array.isArray(json.result) ? json.result : [];
  const lower = address.toLowerCase();
  return rows.map((tx) => ({
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    timestamp: Number(tx.timeStamp) * 1000,
    direction: tx.from.toLowerCase() === lower ? "out" : "in",
  }));
}

interface EsploraTxVin {
  prevout?: { scriptpubkey_address?: string; value?: number };
}
interface EsploraTxVout {
  scriptpubkey_address?: string;
  value?: number;
}
interface EsploraTx {
  txid: string;
  status?: { block_time?: number };
  vin?: EsploraTxVin[];
  vout?: EsploraTxVout[];
}

/** BTC tx history for `address` via the Esplora proxy (`/api/btc/address/:addr/txs`). */
export async function btcHistory(address: string): Promise<TxRow[]> {
  const res = await fetch(`/api/btc/address/${address}/txs`);
  const txs = (await res.json()) as EsploraTx[];
  return (Array.isArray(txs) ? txs : []).map((tx) => {
    const spentFromUs = (tx.vin ?? []).some((v) => v.prevout?.scriptpubkey_address === address);
    const receivedToUs = (tx.vout ?? []).find((v) => v.scriptpubkey_address === address);
    const direction: "in" | "out" = spentFromUs ? "out" : "in";
    const value = String(receivedToUs?.value ?? 0);
    const counterparty =
      (tx.vout ?? []).find((v) => v.scriptpubkey_address !== address)?.scriptpubkey_address ?? "";
    return {
      hash: tx.txid,
      from: spentFromUs ? address : (tx.vin?.[0]?.prevout?.scriptpubkey_address ?? ""),
      to: spentFromUs ? counterparty : address,
      value,
      timestamp: (tx.status?.block_time ?? 0) * 1000,
      direction,
    };
  });
}
