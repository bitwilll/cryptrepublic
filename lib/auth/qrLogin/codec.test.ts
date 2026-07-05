// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  encodeQrLogin,
  decodeQrLogin,
  encodeQrLoginToDataUrl,
  type QrLoginEnvelope,
} from "./codec";

const env: QrLoginEnvelope = {
  v: 1,
  t: "cr-wallet-login",
  challengeId: "clabc123",
  nonce: "deadbeefdeadbeef",
  matchCode: "ABC234",
  domain: "cryptrepublic.com",
  uri: "https://cryptrepublic.com",
  chainId: 84532,
};

describe("QR-login envelope codec", () => {
  it("round-trips encode → decode", () => {
    expect(decodeQrLogin(encodeQrLogin(env))).toEqual(env);
  });

  it("rejects a wrong version", () => {
    expect(() => decodeQrLogin(JSON.stringify({ ...env, v: 2 }))).toThrow();
  });

  it("rejects a wrong type tag", () => {
    expect(() => decodeQrLogin(JSON.stringify({ ...env, t: "phish" }))).toThrow();
  });

  it("rejects non-JSON", () => {
    expect(() => decodeQrLogin("not json at all")).toThrow(/login code/i);
  });

  it("rejects a missing field", () => {
    const { nonce: _drop, ...rest } = env;
    void _drop;
    expect(() => decodeQrLogin(JSON.stringify(rest))).toThrow();
  });

  it("rejects a non-integer chainId", () => {
    expect(() => decodeQrLogin(JSON.stringify({ ...env, chainId: "84532" }))).toThrow();
  });

  it("produces a data: PNG QR image", async () => {
    const url = await encodeQrLoginToDataUrl(env);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
