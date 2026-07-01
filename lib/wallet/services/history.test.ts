// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { evmHistory, btcHistory } from "./history";

const ME = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";

afterEach(() => vi.restoreAllMocks());

describe("evmHistory", () => {
  it("maps Etherscan rows and derives direction", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/history/84532");
      return new Response(
        JSON.stringify({
          status: "1",
          result: [
            { hash: "0xaaa", from: ME, to: "0xbbb", value: "1000", timeStamp: "1700000000" },
            { hash: "0xccc", from: "0xddd", to: ME, value: "2000", timeStamp: "1700000100" },
          ],
        }),
        { status: 200 },
      );
    }) as typeof globalThis.fetch;

    const rows = await evmHistory(84532, ME);
    expect(rows).toHaveLength(2);
    expect(rows[0].direction).toBe("out");
    expect(rows[0].timestamp).toBe(1700000000 * 1000);
    expect(rows[1].direction).toBe("in");
  });
});

describe("btcHistory", () => {
  it("maps Esplora txs and derives direction", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/btc/address/tb1qme/txs");
      return new Response(
        JSON.stringify([
          {
            txid: "abc",
            status: { block_time: 1700000000 },
            vin: [{ prevout: { scriptpubkey_address: "tb1qother", value: 5000 } }],
            vout: [{ scriptpubkey_address: "tb1qme", value: 4000 }],
          },
        ]),
        { status: 200 },
      );
    }) as typeof globalThis.fetch;

    const rows = await btcHistory("tb1qme");
    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe("in");
    expect(rows[0].value).toBe("4000");
    expect(rows[0].to).toBe("tb1qme");
  });
});
