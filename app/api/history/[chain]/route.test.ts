// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "./route";

function makeReq(address?: string): Request {
  const u = new URL("http://localhost/api/history/84532");
  if (address) u.searchParams.set("address", address);
  return new Request(u.toString(), { method: "GET" });
}

afterEach(() => {
  delete process.env.ETHERSCAN_API_KEY;
  vi.restoreAllMocks();
});

describe("GET /api/history/[chain]", () => {
  it("builds the Etherscan v2 URL with chainid + key and forwards", async () => {
    process.env.ETHERSCAN_API_KEY = "SECRETKEY";
    const upstream = { status: "1", result: [] };
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));

    const res = await GET(makeReq("0x1111111111111111111111111111111111111111"), {
      params: Promise.resolve({ chain: "84532" }),
    });
    expect(res.status).toBe(200);
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain("chainid=84532");
    expect(calledUrl).toContain("apikey=SECRETKEY");
    expect(calledUrl).toContain("address=0x1111111111111111111111111111111111111111");
  });

  it("rejects an unknown chain with 400", async () => {
    process.env.ETHERSCAN_API_KEY = "SECRETKEY";
    const res = await GET(makeReq("0x1111111111111111111111111111111111111111"), {
      params: Promise.resolve({ chain: "999999" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a missing address with 400", async () => {
    process.env.ETHERSCAN_API_KEY = "SECRETKEY";
    const res = await GET(makeReq(), { params: Promise.resolve({ chain: "84532" }) });
    expect(res.status).toBe(400);
  });
});
