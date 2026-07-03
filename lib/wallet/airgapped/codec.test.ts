// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { parseTransaction, serializeTransaction } from "viem";
import { buildCall } from "@/lib/wallet/services/call";
import {
  encodeUnsigned,
  decodeUnsigned,
  encodeSigned,
  decodeSigned,
  decodeEnvelopeForDisplay,
  encodeUnsignedToQr,
  QR_BYTE_LIMIT,
  type UnsignedEnvelope,
} from "./codec";

/**
 * Air-gapped envelope codec (Wave 11 C2). Load-bearing assertions:
 *  - envelopes round-trip with bigints intact
 *  - serialize→sign→parse proves the envelope carries EXACTLY what a signer
 *    needs (an offline signer reconstructs the same tx)
 *  - ERC-20 HONESTY: display decodes the TRUE recipient/amount from calldata —
 *    never the raw tx.to (token contract) / tx.value (0)
 *  - the QR capacity guard uses the EC-L cap (2953) it actually pins
 */

const h = vi.hoisted(() => ({
  toDataURL: null as unknown as ReturnType<typeof vi.fn>,
}));
vi.mock("qrcode", () => {
  h.toDataURL = vi.fn(async () => "data:image/png;base64,stub");
  return { default: { toDataURL: h.toDataURL } };
});

const TO = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
// Anvil's well-known account #0 private key — a PUBLIC test key, never a real secret.
const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

function env(tx: Partial<UnsignedEnvelope["tx"]> = {}): UnsignedEnvelope {
  return {
    v: 1,
    t: "cr-eth-tx-unsigned",
    chainId: 84532,
    tx: {
      to: TO,
      value: 12345678901234567890n,
      nonce: 7,
      gas: 21000n,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
      ...tx,
    },
  };
}

describe("codec round-trips", () => {
  it("unsigned envelope round-trips with bigints preserved", () => {
    const e = env({ data: "0xdeadbeef" });
    expect(decodeUnsigned(encodeUnsigned(e))).toEqual(e);
  });

  it("decodeUnsigned rejects wrong version / wrong type / bad shapes", () => {
    const good = JSON.parse(encodeUnsigned(env()));
    expect(() => decodeUnsigned("not json")).toThrow(/invalid/i);
    expect(() => decodeUnsigned(JSON.stringify({ ...good, v: 2 }))).toThrow(/version/i);
    expect(() => decodeUnsigned(JSON.stringify({ ...good, t: "cr-eth-tx-signed" }))).toThrow(
      /unsigned/i,
    );
    expect(() =>
      decodeUnsigned(JSON.stringify({ ...good, tx: { ...good.tx, value: "12x" } })),
    ).toThrow(/value/i);
  });

  it("signed payload round-trips; bare 0x raw accepted; junk rejected", () => {
    const raw = `0x${"ab".repeat(40)}` as const;
    expect(decodeSigned(encodeSigned({ v: 1, t: "cr-eth-tx-signed", raw }))).toBe(raw);
    expect(decodeSigned(raw)).toBe(raw);
    expect(() => decodeSigned("zz-not-hex")).toThrow(/invalid/i);
    expect(() => decodeSigned(JSON.stringify({ v: 1, t: "cr-eth-tx-unsigned", raw }))).toThrow(
      /signed/i,
    );
  });
});

describe("serialize → sign → parse (the offline-signer contract)", () => {
  it("an envelope carries exactly what a signer needs to produce a broadcastable raw tx", async () => {
    const e = env();
    const raw = await account.signTransaction({
      chainId: e.chainId,
      nonce: e.tx.nonce,
      to: e.tx.to,
      value: e.tx.value,
      data: e.tx.data,
      gas: e.tx.gas,
      maxFeePerGas: e.tx.maxFeePerGas,
      maxPriorityFeePerGas: e.tx.maxPriorityFeePerGas,
      type: "eip1559",
    });
    const parsed = parseTransaction(raw);
    expect(parsed.chainId).toBe(e.chainId);
    expect(parsed.nonce).toBe(e.tx.nonce);
    expect(parsed.to?.toLowerCase()).toBe(e.tx.to.toLowerCase());
    expect(parsed.value).toBe(e.tx.value);
    expect(parsed.gas).toBe(e.tx.gas);
    // And the unsigned serialization is stable (what the QR really carries).
    expect(
      serializeTransaction({
        chainId: e.chainId,
        nonce: e.tx.nonce,
        to: e.tx.to,
        value: e.tx.value,
        gas: e.tx.gas,
        maxFeePerGas: e.tx.maxFeePerGas,
        maxPriorityFeePerGas: e.tx.maxPriorityFeePerGas,
        type: "eip1559",
      }),
    ).toMatch(/^0x02/);
  });
});

describe("decodeEnvelopeForDisplay (ERC-20 honesty)", () => {
  it("native: recipient = tx.to, amount = tx.value, no token", () => {
    const d = decodeEnvelopeForDisplay(env());
    expect(d).toEqual({ recipient: TO, amount: 12345678901234567890n, isErc20: false });
  });

  it("ERC-20: decodes the TRUE recipient + amount from calldata — never the raw to/value", () => {
    const call = buildCall({ chainId: 84532, to: TO, amount: 55n, token: TOKEN });
    const e = env({ to: call.to, value: call.value, data: call.data });
    const d = decodeEnvelopeForDisplay(e);
    expect(d.isErc20).toBe(true);
    expect(d.recipient).toBe(TO); // NOT the token contract
    expect(d.amount).toBe(55n); // NOT 0
    expect(d.tokenContract).toBe(TOKEN);
  });

  it("refuses to summarize unknown calldata (no misleading display)", () => {
    expect(() => decodeEnvelopeForDisplay(env({ data: "0x12345678abcdef" }))).toThrow(
      /unrecognized|unsupported/i,
    );
  });
});

describe("QR capacity guard (EC-L cap 2953, pinned)", () => {
  function envOfExactBytes(target: number): UnsignedEnvelope {
    const base = env({ data: "0x" });
    const baseLen = new TextEncoder().encode(encodeUnsigned(base)).length;
    const e = env({ data: `0x${"a".repeat(target - baseLen)}` as `0x${string}` });
    expect(new TextEncoder().encode(encodeUnsigned(e)).length).toBe(target);
    return e;
  }

  it("a 2953-byte payload renders — and pins errorCorrectionLevel 'L'", async () => {
    h.toDataURL.mockClear();
    await encodeUnsignedToQr(envOfExactBytes(QR_BYTE_LIMIT));
    expect(h.toDataURL).toHaveBeenCalledTimes(1);
    expect(h.toDataURL.mock.calls[0][1]).toMatchObject({ errorCorrectionLevel: "L" });
  });

  it("a 2954-byte payload hits OUR guard (clear message, no qrcode low-level throw)", async () => {
    h.toDataURL.mockClear();
    await expect(encodeUnsignedToQr(envOfExactBytes(QR_BYTE_LIMIT + 1))).rejects.toThrow(
      /too large for one QR/i,
    );
    expect(h.toDataURL).not.toHaveBeenCalled();
  });
});
