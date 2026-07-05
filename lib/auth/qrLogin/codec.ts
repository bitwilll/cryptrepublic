// NO "server-only": device B decodes this envelope IN THE BROWSER, and QR
// generation (qrcode) is client-safe. These are pure functions over PUBLIC data
// only — the envelope NEVER carries a key/seed/entropy (see Wave 13 plan §1).
import QRCode from "qrcode";

/** The self-contained, versioned, PUBLIC payload encoded in a wallet-QR login QR. */
export interface QrLoginEnvelope {
  v: 1;
  t: "cr-wallet-login";
  challengeId: string;
  nonce: string;
  matchCode: string;
  domain: string;
  uri: string;
  chainId: number;
}

/** Compact, stable-key-order JSON. PUBLIC data only. */
export function encodeQrLogin(e: QrLoginEnvelope): string {
  return JSON.stringify({
    v: e.v,
    t: e.t,
    challengeId: e.challengeId,
    nonce: e.nonce,
    matchCode: e.matchCode,
    domain: e.domain,
    uri: e.uri,
    chainId: e.chainId,
  });
}

/** Parse + validate a scanned string back to an envelope; throws on any mismatch. */
export function decodeQrLogin(s: string): QrLoginEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(s);
  } catch {
    throw new Error("Not a CryptRepublic login code.");
  }
  if (!raw || typeof raw !== "object") throw new Error("Not a CryptRepublic login code.");
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || o.t !== "cr-wallet-login") throw new Error("Not a CryptRepublic login code.");
  for (const k of ["challengeId", "nonce", "matchCode", "domain", "uri"] as const) {
    if (typeof o[k] !== "string" || (o[k] as string).length === 0) {
      throw new Error("Malformed login code.");
    }
  }
  if (typeof o.chainId !== "number" || !Number.isInteger(o.chainId)) {
    throw new Error("Malformed login code.");
  }
  return {
    v: 1,
    t: "cr-wallet-login",
    challengeId: o.challengeId as string,
    nonce: o.nonce as string,
    matchCode: o.matchCode as string,
    domain: o.domain as string,
    uri: o.uri as string,
    chainId: o.chainId as number,
  };
}

/** Render the envelope as a `data:` PNG QR (EC-L, pinned for parity with the air-gapped codec). */
export async function encodeQrLoginToDataUrl(e: QrLoginEnvelope): Promise<string> {
  return QRCode.toDataURL(encodeQrLogin(e), { margin: 1, errorCorrectionLevel: "L" });
}
