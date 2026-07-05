// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bytesToHex, numberToHex } from "viem";
import { unlock, lock, revealMnemonic } from "@/lib/wallet/embedded/session";
import { saveVault, deleteVault } from "@/lib/wallet/embedded/storage";
import { encryptEntropy } from "@/lib/wallet/embedded/vault";
import {
  mnemonicToEntropy,
  mnemonicToSeed,
  entropyToMnemonic,
} from "@/lib/wallet/embedded/mnemonic";
import {
  deriveEvm,
  deriveSolana,
  deriveBitcoin,
  evmPrivateKeyHex,
} from "@/lib/wallet/embedded/derive";
import { sendEvm } from "@/lib/wallet/services/send";
import { buildUnsignedTx } from "@/lib/wallet/airgapped/build";
import { broadcastSignedRaw } from "@/lib/wallet/airgapped/broadcast";
import { signUnsignedEnvelope } from "@/lib/wallet/airgapped/sign";
import { encodeUnsigned, encodeUnsignedToQr, encodeSigned } from "@/lib/wallet/airgapped/codec";
import { encodeQrLogin, encodeQrLoginToDataUrl } from "@/lib/auth/qrLogin/codec";

/**
 * AUTHORITATIVE runtime secret-leak guard. Spies on global.fetch across the FULL
 * embedded-wallet flow — createWallet(fixed vault) -> unlock -> sendEvm -> reveal
 * — with a FIXED test vault (the all-zero "abandon…art" 24-word phrase) so the
 * mnemonic, entropy hex, and derived EVM private-key hex are KNOWN constants.
 * After the flow, EVERY captured request body is scanned and MUST contain NONE
 * of those secrets. A signed raw transaction IS broadcast and is NOT a secret —
 * the scan targets the mnemonic/entropy/private key, not the serialized tx.
 */

// Fixed test vault (all-zero 256-bit entropy -> the canonical 24-word phrase).
const M =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon " +
  "abandon abandon abandon art";
const PASS = "fixed-passphrase-123";
const TO = "0x1111111111111111111111111111111111111111" as const;
const STUB_HASH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

const captured: string[] = [];
let originalFetch: typeof globalThis.fetch;

/** Seed a DETERMINISTIC vault from the fixed mnemonic (no random generation). */
async function seedFixedVault(): Promise<void> {
  const entropy = mnemonicToEntropy(M);
  const seed = await mnemonicToSeed(M);
  const addresses = {
    evm: deriveEvm(seed).address,
    solana: deriveSolana(seed).address,
    bitcoin: deriveBitcoin(seed, "testnet").address,
  };
  const blob = await encryptEntropy(entropy, PASS, addresses, "Primary");
  await saveVault(blob);
}

beforeEach(async () => {
  lock();
  await deleteVault();
  captured.length = 0;
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.body) captured.push(String(init.body));
    const req = init?.body
      ? (JSON.parse(String(init.body)) as { method?: string; id?: number })
      : { id: 1 };
    const ok = (result: unknown) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), { status: 200 });
    switch (req.method) {
      case "eth_getTransactionCount":
        return ok(numberToHex(0));
      case "eth_maxPriorityFeePerGas":
        return ok(numberToHex(1_000_000_000n));
      case "eth_gasPrice":
        return ok(numberToHex(2_000_000_000n));
      case "eth_getBlockByNumber":
        return ok({ baseFeePerGas: numberToHex(1_000_000_000n), number: numberToHex(100n) });
      case "eth_estimateGas":
        return ok(numberToHex(21_000n));
      case "eth_sendRawTransaction":
        return ok(STUB_HASH);
      default:
        return ok("0x0");
    }
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("no secret reaches the network (create -> unlock -> sendEvm -> reveal)", () => {
  it("captures fetch bodies and finds no mnemonic / entropy / private-key", async () => {
    const seed = await mnemonicToSeed(M);
    const entropyHex = bytesToHex(mnemonicToEntropy(M)).slice(2).toLowerCase();
    const privHex = evmPrivateKeyHex(seed).slice(2).toLowerCase();

    // Full flow against the FIXED vault.
    await seedFixedVault();
    const accounts = await unlock(PASS);
    expect(entropyToMnemonic(mnemonicToEntropy(M))).toBe(M); // sanity: fixed vector round-trips

    const hash = await sendEvm({ chainId: 84532, to: TO, amount: 10n ** 15n });
    expect(hash).toBe(STUB_HASH); // the send actually hit the network
    const revealed = await revealMnemonic(PASS);
    expect(revealed).toBe(M);
    expect(accounts.evm).toBe(deriveEvm(seed).address);

    // The send flow MUST have produced network traffic (so this is not vacuous).
    expect(captured.length).toBeGreaterThan(0);

    // No captured body may contain any known secret (case-insensitive; with/without 0x).
    for (const body of captured) {
      const hay = body.toLowerCase();
      expect(hay.includes(M)).toBe(false);
      expect(hay.includes(entropyHex)).toBe(false);
      expect(hay.includes(privHex)).toBe(false);
      expect(hay.includes(`0x${privHex}`)).toBe(false);
    }

    // Sanity: the signed raw tx WAS broadcast (allowed — it is not a secret).
    const rawTxSent = captured.some((b) => b.includes("eth_sendRawTransaction"));
    expect(rawTxSent).toBe(true);
  });

  it("Wave 11: air-gapped build+sign+broadcast leaks no secret in fetch bodies OR QR payloads", async () => {
    const seed = await mnemonicToSeed(M);
    const entropyHex = bytesToHex(mnemonicToEntropy(M)).slice(2).toLowerCase();
    const privHex = evmPrivateKeyHex(seed).slice(2).toLowerCase();
    const secrets = [M, entropyHex, privHex, `0x${privHex}`];
    const cleanOf = (hay: string) => {
      const lower = hay.toLowerCase();
      for (const s of secrets) expect(lower.includes(s)).toBe(false);
    };

    await seedFixedVault();
    await unlock(PASS);
    const evmAddress = deriveEvm(seed).address as `0x${string}`;

    // WATCH-ONLY half: build the unsigned envelope for the (watched) address.
    const env = await buildUnsignedTx({ chainId: 84532, to: TO, amount: 10n ** 15n }, evmAddress);

    // The QR payloads carry ONLY tx params / a public raw tx — never a secret.
    const unsignedText = encodeUnsigned(env);
    cleanOf(unsignedText);
    const unsignedQr = await encodeUnsignedToQr(env);
    cleanOf(unsignedQr);

    // OFFLINE-SIGNER half: sign locally (no broadcast happens inside sign).
    const fetchCountBeforeSign = captured.length;
    const signed = await signUnsignedEnvelope(env);
    expect(captured.length).toBe(fetchCountBeforeSign); // signing made ZERO network calls
    const signedText = encodeSigned(signed);
    cleanOf(signedText);

    // WATCH-ONLY half: broadcast the signed payload via the app path.
    const hash = await broadcastSignedRaw(84532, signedText);
    expect(hash).toBe(STUB_HASH);

    // Every fetch body across the whole loop is secret-free…
    expect(captured.length).toBeGreaterThan(0);
    for (const body of captured) cleanOf(body);
    // …the broadcast used the allowed raw-tx method…
    expect(captured.some((b) => b.includes("eth_sendRawTransaction"))).toBe(true);
    // …and the forbidden signing/enumeration methods never appear.
    for (const forbidden of ["eth_sendTransaction", "personal_sign", "eth_sign", "eth_accounts"]) {
      expect(captured.some((b) => b.includes(`"${forbidden}"`))).toBe(false);
    }
  });

  it("Wave 13: the wallet-QR LOGIN envelope (QR payload) carries no secret — public data only", async () => {
    const seed = await mnemonicToSeed(M);
    const entropyHex = bytesToHex(mnemonicToEntropy(M)).slice(2).toLowerCase();
    const privHex = evmPrivateKeyHex(seed).slice(2).toLowerCase();
    const secrets = [M, entropyHex, privHex, `0x${privHex}`];
    const evmAddress = deriveEvm(seed).address.toLowerCase();

    // A representative login envelope — the SAME shape the /start route emits and
    // the device-A QR encodes. It carries ONLY public relay fields.
    const envelope = {
      v: 1 as const,
      t: "cr-wallet-login" as const,
      challengeId: "clfixedchallenge0001",
      nonce: "deadbeefdeadbeefdeadbeefdeadbeef",
      matchCode: "ABC234",
      domain: "cryptrepublic.com",
      uri: "https://cryptrepublic.com",
      chainId: 84532,
    };
    const text = encodeQrLogin(envelope);
    const qr = await encodeQrLoginToDataUrl(envelope);

    for (const hay of [text.toLowerCase(), qr.toLowerCase()]) {
      for (const s of secrets) expect(hay.includes(s)).toBe(false);
    }
    // Invariant: the envelope is minimal — it doesn't even carry the wallet
    // address, let alone any key material.
    expect(text).toContain("cr-wallet-login");
    expect(text.toLowerCase().includes(evmAddress)).toBe(false);
  });
});
