// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { numberToHex } from "viem";
import { previewEvmSend, sendEvm, sendSolana, sendBitcoin, BTC_SEND_ENABLED } from "./send";
import { createWallet, unlock, lock } from "@/lib/wallet/embedded/session";
import { deleteVault } from "@/lib/wallet/embedded/storage";

/**
 * Send-layer tests. The embedded wallet signs an EIP-1559 tx LOCALLY with a
 * transient account and broadcasts the raw tx via the `/api/rpc/<chainId>`
 * proxy. We stub the JSON-RPC methods the send path emits.
 */

const TO = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const; // USDC (Base Sepolia)
const PASS = "fixed-passphrase-123";
const STUB_HASH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

let originalFetch: typeof globalThis.fetch;
const seen: { method: string; params: unknown }[] = [];

/** Build a fetch stub that answers each JSON-RPC method for a full send. */
function rpcStub(opts: { sendRawError?: boolean } = {}): typeof globalThis.fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body)) as { method: string; params: unknown; id: number };
    seen.push({ method: req.method, params: req.params });
    const ok = (result: unknown) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), { status: 200 });
    switch (req.method) {
      case "eth_getTransactionCount":
        return ok(numberToHex(3));
      case "eth_maxPriorityFeePerGas":
        return ok(numberToHex(1_000_000_000n));
      case "eth_gasPrice":
        return ok(numberToHex(2_000_000_000n));
      case "eth_getBlockByNumber":
        return ok({ baseFeePerGas: numberToHex(1_000_000_000n), number: numberToHex(100n) });
      case "eth_estimateGas":
        return ok(numberToHex(21_000n));
      case "eth_chainId":
        return ok(numberToHex(84532));
      case "eth_sendRawTransaction":
        if (opts.sendRawError) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: req.id,
              error: { code: -32000, message: "nonce too low" },
            }),
            { status: 200 },
          );
        }
        return ok(STUB_HASH);
      default:
        return ok("0x0");
    }
  }) as typeof globalThis.fetch;
}

beforeEach(async () => {
  lock();
  await deleteVault();
  seen.length = 0;
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("previewEvmSend", () => {
  it("returns a fee estimate", async () => {
    const { accounts } = await createWallet(PASS);
    globalThis.fetch = rpcStub();
    const preview = await previewEvmSend(
      { chainId: 84532, to: TO, amount: 10n ** 15n },
      accounts.evm as `0x${string}`,
    );
    expect(preview.to).toBe(TO);
    expect(preview.chainId).toBe(84532);
    expect(BigInt(preview.feeEstimate)).toBeGreaterThan(0n);
  });
});

describe("sendEvm", () => {
  it("signs locally and broadcasts a native transfer, returning the tx hash", async () => {
    await createWallet(PASS);
    globalThis.fetch = rpcStub();
    const hash = await sendEvm({ chainId: 84532, to: TO, amount: 10n ** 15n });
    expect(hash).toBe(STUB_HASH);
    // A raw signed tx was broadcast (typed EIP-1559 tx starts 0x02).
    const raw = seen.find((s) => s.method === "eth_sendRawTransaction");
    expect(raw).toBeDefined();
    const serialized = (raw?.params as string[])[0];
    expect(serialized.startsWith("0x02")).toBe(true);
  });

  it("encodes an ERC-20 transfer when a token is set", async () => {
    await createWallet(PASS);
    globalThis.fetch = rpcStub();
    await sendEvm({ chainId: 84532, to: TO, amount: 1_000_000n, token: TOKEN });
    // estimateGas for a token transfer carries the encoded transfer() calldata to the token.
    const est = seen.find((s) => s.method === "eth_estimateGas");
    const call = (est?.params as { to?: string; data?: string }[])[0];
    expect(call.to?.toLowerCase()).toBe(TOKEN.toLowerCase());
    // transfer(address,uint256) selector = 0xa9059cbb
    expect(call.data?.startsWith("0xa9059cbb")).toBe(true);
  });

  it("PROPAGATES a JSON-RPC error from eth_sendRawTransaction (does not swallow)", async () => {
    await createWallet(PASS);
    globalThis.fetch = rpcStub({ sendRawError: true });
    await expect(sendEvm({ chainId: 84532, to: TO, amount: 10n ** 15n })).rejects.toThrow();
  });

  it("requires an unlocked wallet", async () => {
    await createWallet(PASS);
    lock();
    globalThis.fetch = rpcStub();
    await expect(sendEvm({ chainId: 84532, to: TO, amount: 10n ** 15n })).rejects.toThrow(/lock/i);
    // re-unlock and it works
    await unlock(PASS);
    const hash = await sendEvm({ chainId: 84532, to: TO, amount: 10n ** 15n });
    expect(hash).toBe(STUB_HASH);
  });
});

describe("sendSolana", () => {
  it("is unlock-gated", async () => {
    await createWallet(PASS);
    lock();
    await expect(sendSolana(TO, 1_000_000n)).rejects.toThrow(/lock/i);
  });
});

describe("bitcoin send is disabled (receive-only in v1)", () => {
  it("BTC_SEND_ENABLED is false and sendBitcoin throws", () => {
    expect(BTC_SEND_ENABLED).toBe(false);
    expect(() => sendBitcoin()).toThrow(/not available/i);
  });
});
