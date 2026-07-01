// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { SiweMessage } from "siwe";
import { buildSiweMessage, connectAndAuthenticate } from "./siwe";
import { activeChain } from "@/lib/config/chain";

const ADDRESS = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
const NONCE = "abcd1234abcd1234abcd1234";

afterEach(() => vi.restoreAllMocks());

describe("buildSiweMessage", () => {
  it("binds domain=host and uri=origin of NEXT_PUBLIC_APP_URL", () => {
    const msg = buildSiweMessage(ADDRESS, NONCE, activeChain().primaryChainId);
    const parsed = new SiweMessage(msg);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    expect(parsed.domain).toBe(new URL(appUrl).host);
    expect(parsed.uri).toBe(new URL(appUrl).origin);
    expect(parsed.chainId).toBe(activeChain().primaryChainId);
    expect(parsed.nonce).toBe(NONCE);
  });
});

describe("connectAndAuthenticate", () => {
  it("FORCES the message chainId to the primary chain even when the wallet is on another chain", async () => {
    const posted: { message?: string; signature?: string } = {};
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/siwe/nonce")) {
        return new Response(JSON.stringify({ nonce: NONCE }), { status: 200 });
      }
      if (url.includes("/api/auth/siwe/verify")) {
        const body = JSON.parse(String(init?.body)) as { message: string; signature: string };
        posted.message = body.message;
        posted.signature = body.signature;
        return new Response(JSON.stringify({ ok: true, next: "/dashboard" }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof globalThis.fetch;

    // The connected wallet reports chainId 1 (Ethereum) — a NON-primary chain the
    // Wave 2 server would reject. connectAndAuthenticate must still build+sign a
    // message with the PRIMARY chainId.
    const signMessage = vi.fn(async (_msg: string) => "0xsignature");
    const result = await connectAndAuthenticate(signMessage, ADDRESS);

    expect(result.ok).toBe(true);
    expect(result.next).toBe("/dashboard");
    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(posted.signature).toBe("0xsignature");

    const sent = new SiweMessage(posted.message!);
    expect(sent.chainId).toBe(activeChain().primaryChainId);
    expect(sent.chainId).not.toBe(1);
  });
});
