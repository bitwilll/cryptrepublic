// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";

const h = vi.hoisted(() => ({
  getTransactionCount: null as unknown as ReturnType<typeof vi.fn>,
  estimateFeesPerGas: null as unknown as ReturnType<typeof vi.fn>,
  estimateGas: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/wallet/services/evmClients", () => {
  h.getTransactionCount = vi.fn(async () => 7);
  h.estimateFeesPerGas = vi.fn(async () => ({
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 1_000_000n,
  }));
  h.estimateGas = vi.fn(async () => 21000n);
  return {
    publicClientFor: () => ({
      getTransactionCount: h.getTransactionCount,
      estimateFeesPerGas: h.estimateFeesPerGas,
      estimateGas: h.estimateGas,
    }),
  };
});

import { buildUnsignedTx } from "./build";

const FROM = "0x00000000000000000000000000000000000000A1" as const;
const TO = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;

describe("buildUnsignedTx (watch-only, signer-free)", () => {
  it("native: the envelope tx equals the shape sendEvm would sign", async () => {
    const env = await buildUnsignedTx({ chainId: 84532, to: TO, amount: 9n }, FROM);
    expect(env.v).toBe(1);
    expect(env.t).toBe("cr-eth-tx-unsigned");
    expect(env.chainId).toBe(84532);
    expect(env.tx).toEqual({
      to: TO,
      value: 9n,
      nonce: 7,
      gas: 21000n,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
    });
    // Nonce reads PENDING for the WATCHED address — same as the embedded path.
    expect(h.getTransactionCount).toHaveBeenCalledWith({ address: FROM, blockTag: "pending" });
    expect(h.estimateGas).toHaveBeenCalledWith({
      account: FROM,
      to: TO,
      value: 9n,
      data: undefined,
    });
  });

  it("ERC-20: to = token contract, value = 0, data = transfer calldata", async () => {
    const env = await buildUnsignedTx({ chainId: 84532, to: TO, amount: 5n, token: TOKEN }, FROM);
    expect(env.tx.to).toBe(TOKEN);
    expect(env.tx.value).toBe(0n);
    expect(env.tx.data).toBe(
      encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [TO, 5n] }),
    );
  });
});
