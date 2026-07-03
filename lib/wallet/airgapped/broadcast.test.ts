// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({
  sendRawTransaction: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/wallet/services/evmClients", () => {
  h.sendRawTransaction = vi.fn(async () => "0x" + "cd".repeat(32));
  return { publicClientFor: () => ({ sendRawTransaction: h.sendRawTransaction }) };
});

import { broadcastSignedRaw } from "./broadcast";
import { encodeSigned } from "./codec";

const RAW = `0x02${"ab".repeat(50)}` as `0x${string}`;

describe("broadcastSignedRaw (watch-only, signer-free)", () => {
  it("a signed ENVELOPE decodes and broadcasts via eth_sendRawTransaction", async () => {
    const hash = await broadcastSignedRaw(
      84532,
      encodeSigned({ v: 1, t: "cr-eth-tx-signed", raw: RAW }),
    );
    expect(hash).toMatch(/^0x/);
    expect(h.sendRawTransaction).toHaveBeenCalledWith({ serializedTransaction: RAW });
  });

  it("a BARE 0x raw tx also broadcasts", async () => {
    await broadcastSignedRaw(84532, RAW);
    expect(h.sendRawTransaction).toHaveBeenLastCalledWith({ serializedTransaction: RAW });
  });

  it("junk input throws BEFORE any RPC call", async () => {
    h.sendRawTransaction.mockClear();
    await expect(broadcastSignedRaw(84532, "not-a-tx")).rejects.toThrow(/invalid/i);
    expect(h.sendRawTransaction).not.toHaveBeenCalled();
  });
});
