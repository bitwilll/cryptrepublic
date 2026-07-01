// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

function req(): Request {
  return new Request("http://localhost/api/btc/anything", { method: "GET" });
}

describe("GET /api/btc/[...path]", () => {
  it("forwards an allow-listed address path to the testnet mempool.space base", async () => {
    const upstream = { address: "tb1q", chain_stats: {} };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));

    const res = await GET(req(), {
      params: Promise.resolve({ path: ["address", "tb1qexampleaddr"] }),
    });
    expect(res.status).toBe(200);
    const url = String(fetchSpy.mock.calls[0][0]);
    // default env = testnet
    expect(url).toBe("https://mempool.space/testnet/api/address/tb1qexampleaddr");
  });

  it("forwards address/:addr/utxo", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200 }));
    await GET(req(), { params: Promise.resolve({ path: ["address", "tb1qaddr", "utxo"] }) });
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      "https://mempool.space/testnet/api/address/tb1qaddr/utxo",
    );
  });

  it("rejects a non-allow-listed path with 400", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const res = await GET(req(), { params: Promise.resolve({ path: ["blocks", "tip"] }) });
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a malformed tx id with 400", async () => {
    const res = await GET(req(), { params: Promise.resolve({ path: ["tx", "nothex"] }) });
    expect(res.status).toBe(400);
  });
});
