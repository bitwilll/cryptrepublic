// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import {
  isAllowedEvmMethod,
  isAllowedSolanaMethod,
  serverRpcUrl,
  ALLOWED_EVM_METHODS,
} from "./allowlist";

const ENV = "RPC_BASE_SEPOLIA";

afterEach(() => {
  delete process.env[ENV];
});

describe("EVM RPC allow-list", () => {
  it("allows read + broadcast methods", () => {
    expect(isAllowedEvmMethod("eth_call")).toBe(true);
    expect(isAllowedEvmMethod("eth_getBalance")).toBe(true);
    expect(isAllowedEvmMethod("eth_sendRawTransaction")).toBe(true);
    expect(isAllowedEvmMethod("eth_estimateGas")).toBe(true);
  });
  it("forbids signing / account methods", () => {
    expect(isAllowedEvmMethod("personal_sign")).toBe(false);
    expect(isAllowedEvmMethod("eth_accounts")).toBe(false);
    expect(isAllowedEvmMethod("eth_sendTransaction")).toBe(false);
    expect(isAllowedEvmMethod("eth_sign")).toBe(false);
  });
  it("never contains a signing/account method", () => {
    expect(ALLOWED_EVM_METHODS).not.toContain("eth_accounts");
    expect(ALLOWED_EVM_METHODS).not.toContain("personal_sign");
  });
});

describe("Solana RPC allow-list", () => {
  it("allows read + broadcast methods", () => {
    expect(isAllowedSolanaMethod("getBalance")).toBe(true);
    expect(isAllowedSolanaMethod("sendTransaction")).toBe(true);
    expect(isAllowedSolanaMethod("getParsedTokenAccountsByOwner")).toBe(true);
  });
  it("forbids unknown methods", () => {
    expect(isAllowedSolanaMethod("requestAirdrop")).toBe(false);
  });
});

describe("serverRpcUrl", () => {
  it("throws when the keyed env var is unset", () => {
    delete process.env[ENV];
    expect(() => serverRpcUrl(84532)).toThrow();
  });
  it("returns the keyed URL when set", () => {
    process.env[ENV] = "https://keyed.example/rpc?key=secret";
    expect(serverRpcUrl(84532)).toBe("https://keyed.example/rpc?key=secret");
  });
  it("throws for an unknown chain", () => {
    expect(() => serverRpcUrl(999999)).toThrow();
  });
});
