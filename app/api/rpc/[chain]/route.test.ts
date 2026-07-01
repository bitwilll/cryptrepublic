// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "./route";

const ENV = "RPC_BASE_SEPOLIA";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/rpc/84532", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  delete process.env[ENV];
  vi.restoreAllMocks();
});

describe("POST /api/rpc/[chain]", () => {
  it("forwards an allow-listed method to the keyed RPC and returns the JSON", async () => {
    process.env[ENV] = "https://keyed.example/rpc?key=secret";
    const upstream = { jsonrpc: "2.0", id: 1, result: "0x10" };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));

    const res = await POST(
      makeReq({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      {
        params: Promise.resolve({ chain: "84532" }),
      },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstream);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://keyed.example/rpc?key=secret");
  });

  it("rejects a non-allow-listed method with 400", async () => {
    process.env[ENV] = "https://keyed.example/rpc";
    const fetchSpy = vi.spyOn(global, "fetch");
    const res = await POST(makeReq({ jsonrpc: "2.0", method: "eth_accounts", params: [], id: 1 }), {
      params: Promise.resolve({ chain: "84532" }),
    });
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a batch containing a forbidden method with 400", async () => {
    process.env[ENV] = "https://keyed.example/rpc";
    const fetchSpy = vi.spyOn(global, "fetch");
    const res = await POST(
      makeReq([
        { jsonrpc: "2.0", method: "eth_call", params: [], id: 1 },
        { jsonrpc: "2.0", method: "personal_sign", params: [], id: 2 },
      ]),
      { params: Promise.resolve({ chain: "84532" }) },
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown/inactive chain", async () => {
    const res = await POST(makeReq({ jsonrpc: "2.0", method: "eth_call", params: [], id: 1 }), {
      params: Promise.resolve({ chain: "999999" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the keyed env var is unset", async () => {
    delete process.env[ENV];
    const res = await POST(makeReq({ jsonrpc: "2.0", method: "eth_call", params: [], id: 1 }), {
      params: Promise.resolve({ chain: "84532" }),
    });
    expect(res.status).toBe(400);
  });
});
