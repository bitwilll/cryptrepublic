// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "./route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/rpc/solana", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  delete process.env.RPC_SOLANA;
  vi.restoreAllMocks();
});

describe("POST /api/rpc/solana", () => {
  it("forwards an allow-listed method to the keyed URL", async () => {
    process.env.RPC_SOLANA = "https://sol.example/rpc?key=secret";
    const upstream = { jsonrpc: "2.0", id: 1, result: { value: 42 } };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));

    const res = await POST(
      makeReq({ jsonrpc: "2.0", method: "getBalance", params: ["addr"], id: 1 }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstream);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://sol.example/rpc?key=secret");
  });

  it("rejects a non-allow-listed method with 400", async () => {
    process.env.RPC_SOLANA = "https://sol.example/rpc";
    const fetchSpy = vi.spyOn(global, "fetch");
    const res = await POST(
      makeReq({ jsonrpc: "2.0", method: "requestAirdrop", params: [], id: 1 }),
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
