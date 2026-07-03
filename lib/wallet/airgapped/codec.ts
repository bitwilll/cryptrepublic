import "client-only";
import { decodeFunctionData, erc20Abi, isHex } from "viem";
import QRCode from "qrcode";

/**
 * AIR-GAPPED QR envelope codec (Wave 11 C2) — a SELF-CONTAINED versioned
 * CryptRepublic format (NOT BC-UR/Keystone interop; that is documented future
 * work). The unsigned envelope carries ONLY tx parameters — never a key; the
 * signed payload is a public raw tx (safe to broadcast). Bigints travel as
 * decimal strings.
 *
 * CUSTODY BOUNDARY: this module has no signer, no seed, no fetch — it encodes,
 * decodes, and renders QR data URLs (CSP: img-src data:).
 */

export interface UnsignedTxParams {
  to: `0x${string}`;
  value: bigint;
  data?: `0x${string}`;
  nonce: number;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface UnsignedEnvelope {
  v: 1;
  t: "cr-eth-tx-unsigned";
  chainId: number;
  tx: UnsignedTxParams;
}

export interface SignedEnvelope {
  v: 1;
  t: "cr-eth-tx-signed";
  raw: `0x${string}`;
}

/** Encode an unsigned envelope to a compact JSON string (bigints → decimal strings). */
export function encodeUnsigned(env: UnsignedEnvelope): string {
  const { tx } = env;
  return JSON.stringify({
    v: env.v,
    t: env.t,
    chainId: env.chainId,
    tx: {
      to: tx.to,
      value: tx.value.toString(),
      ...(tx.data !== undefined ? { data: tx.data } : {}),
      nonce: tx.nonce,
      gas: tx.gas.toString(),
      maxFeePerGas: tx.maxFeePerGas.toString(),
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas.toString(),
    },
  });
}

function fail(msg: string): never {
  throw new Error(`Invalid air-gapped payload: ${msg}`);
}

export function decodeUnsigned(s: string): UnsignedEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    fail("not JSON.");
  }
  const p = parsed as Record<string, unknown>;
  if (p.v !== 1) fail("unsupported version.");
  if (p.t !== "cr-eth-tx-unsigned") fail("not an unsigned-transaction envelope.");
  if (typeof p.chainId !== "number" || !Number.isInteger(p.chainId)) fail("bad chainId.");
  const tx = p.tx as Record<string, unknown> | undefined;
  if (!tx || typeof tx !== "object") fail("missing tx.");
  if (typeof tx.to !== "string" || !isHex(tx.to)) fail("bad tx.to.");
  if (tx.data !== undefined && (typeof tx.data !== "string" || !isHex(tx.data))) {
    fail("bad tx.data.");
  }
  if (typeof tx.nonce !== "number" || !Number.isInteger(tx.nonce) || tx.nonce < 0) {
    fail("bad tx.nonce.");
  }
  const big = (name: string, v: unknown): bigint => {
    if (typeof v !== "string" || !/^\d+$/.test(v)) fail(`bad tx.${name}.`);
    return BigInt(v as string);
  };
  return {
    v: 1,
    t: "cr-eth-tx-unsigned",
    chainId: p.chainId,
    tx: {
      to: tx.to as `0x${string}`,
      value: big("value", tx.value),
      ...(tx.data !== undefined ? { data: tx.data as `0x${string}` } : {}),
      nonce: tx.nonce,
      gas: big("gas", tx.gas),
      maxFeePerGas: big("maxFeePerGas", tx.maxFeePerGas),
      maxPriorityFeePerGas: big("maxPriorityFeePerGas", tx.maxPriorityFeePerGas),
    },
  };
}

export function encodeSigned(env: SignedEnvelope): string {
  return JSON.stringify({ v: env.v, t: env.t, raw: env.raw });
}

/** Accept either a bare 0x raw tx OR a {v,t,raw} envelope; return the 0x raw. */
export function decodeSigned(s: string): `0x${string}` {
  const trimmed = s.trim();
  if (isHex(trimmed)) return trimmed as `0x${string}`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    fail("neither a 0x raw transaction nor a signed envelope.");
  }
  const p = parsed as Record<string, unknown>;
  if (p.v !== 1 || p.t !== "cr-eth-tx-signed") fail("not a signed-transaction envelope.");
  if (typeof p.raw !== "string" || !isHex(p.raw)) fail("bad raw transaction hex.");
  return p.raw as `0x${string}`;
}

/**
 * HONEST human-readable summary of an unsigned envelope. For ERC-20 transfers
 * the raw `tx.to`/`tx.value` are the TOKEN CONTRACT and 0 — the true recipient
 * + amount live in the calldata and MUST be decoded (never display the raw
 * fields for an ERC-20). Unknown non-transfer calldata throws — the offline
 * signer refuses to render a misleading summary.
 */
export interface DecodedEnvelope {
  recipient: `0x${string}`;
  amount: bigint;
  tokenContract?: `0x${string}`; // present for ERC-20; absent for native
  isErc20: boolean;
}

export function decodeEnvelopeForDisplay(env: UnsignedEnvelope): DecodedEnvelope {
  const { tx } = env;
  if (tx.data === undefined || tx.data === "0x") {
    return { recipient: tx.to, amount: tx.value, isErc20: false };
  }
  let decoded: { functionName: string; args: readonly unknown[] };
  try {
    decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
  } catch {
    fail("unrecognized calldata — refusing to summarize a transaction we cannot decode.");
  }
  if (decoded.functionName !== "transfer") {
    fail(`unsupported call ${decoded.functionName} — only ERC-20 transfer is supported.`);
  }
  const [recipient, amount] = decoded.args as [`0x${string}`, bigint];
  return { recipient, amount, tokenContract: tx.to, isErc20: true };
}

/**
 * Version-40 BYTE-mode capacity of the bundled `qrcode` 1.5.4 at the EC level
 * this module PINS ("L"): 2953 bytes (EC-M would be 2331 — receive.ts's
 * unpinned default; do not copy it here or the constant lies).
 */
export const QR_BYTE_LIMIT = 2953;

/**
 * Encode + render an unsigned envelope as a QR data URL. The EXACT UTF-8 byte
 * length is checked BEFORE toDataURL: past QR_BYTE_LIMIT this throws a clear
 * guard (multi-part BC-UR is documented follow-up work) — never a silent
 * truncation and never qrcode's own low-level throw.
 */
export async function encodeUnsignedToQr(env: UnsignedEnvelope): Promise<string> {
  const s = encodeUnsigned(env);
  const bytes = new TextEncoder().encode(s).length;
  if (bytes > QR_BYTE_LIMIT) {
    throw new Error(
      `Transaction too large for one QR (${bytes} bytes > ${QR_BYTE_LIMIT}) — ` +
        "multi-part QR (BC-UR) is a documented follow-up.",
    );
  }
  return QRCode.toDataURL(s, { margin: 1, errorCorrectionLevel: "L" });
}

/** Render the SIGNED payload as a QR data URL (same EC-L pin + byte guard). */
export async function encodeSignedToQr(env: SignedEnvelope): Promise<string> {
  const s = encodeSigned(env);
  const bytes = new TextEncoder().encode(s).length;
  if (bytes > QR_BYTE_LIMIT) {
    throw new Error(
      `Signed transaction too large for one QR (${bytes} bytes > ${QR_BYTE_LIMIT}) — ` +
        "multi-part QR (BC-UR) is a documented follow-up.",
    );
  }
  return QRCode.toDataURL(s, { margin: 1, errorCorrectionLevel: "L" });
}
