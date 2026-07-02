// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { encodeFunctionData, erc20Abi, type WalletClient } from "viem";
import { sendEvmExternal, type EvmSendRequest } from "./send";

/**
 * sendEvmExternal (Wave 11 B1): the EXTERNAL wallet's OWN signer signs and
 * broadcasts — this app never sees the key. Native → sendTransaction;
 * ERC-20 → writeContract(erc20.transfer). Null account → throw.
 */

const TO = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const HASH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as const;
const ACCOUNT = { address: "0x00000000000000000000000000000000000000A1", type: "json-rpc" };

function mockWalletClient(withAccount = true) {
  return {
    account: withAccount ? ACCOUNT : undefined,
    sendTransaction: vi.fn(async () => HASH),
    writeContract: vi.fn(async () => HASH),
  } as unknown as WalletClient & {
    sendTransaction: ReturnType<typeof vi.fn>;
    writeContract: ReturnType<typeof vi.fn>;
  };
}

describe("sendEvmExternal", () => {
  it("native send → walletClient.sendTransaction({to, value}) → the wallet's hash", async () => {
    const wc = mockWalletClient();
    const req: EvmSendRequest = { chainId: 84532, to: TO, amount: 7n };
    expect(await sendEvmExternal(wc, req)).toBe(HASH);
    expect(wc.sendTransaction).toHaveBeenCalledTimes(1);
    const arg = wc.sendTransaction.mock.calls[0][0];
    expect(arg.to).toBe(TO);
    expect(arg.value).toBe(7n);
    expect(wc.writeContract).not.toHaveBeenCalled();
  });

  it("ERC-20 send → writeContract(erc20.transfer[to, amount]) at the token contract", async () => {
    const wc = mockWalletClient();
    const req: EvmSendRequest = { chainId: 84532, to: TO, amount: 5n, token: TOKEN };
    expect(await sendEvmExternal(wc, req)).toBe(HASH);
    expect(wc.writeContract).toHaveBeenCalledTimes(1);
    const arg = wc.writeContract.mock.calls[0][0];
    expect(arg.address).toBe(TOKEN);
    expect(arg.functionName).toBe("transfer");
    expect(arg.args).toEqual([TO, 5n]);
    // The wallet encodes exactly what the embedded path would.
    expect(encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [TO, 5n] })).toMatch(
      /^0xa9059cbb/,
    );
    expect(wc.sendTransaction).not.toHaveBeenCalled();
  });

  it("throws when the external wallet has no account", async () => {
    const wc = mockWalletClient(false);
    await expect(sendEvmExternal(wc, { chainId: 84532, to: TO, amount: 1n })).rejects.toThrow(
      /no account/i,
    );
  });

  it("a wallet rejection propagates as a thrown error (no false success)", async () => {
    const wc = mockWalletClient();
    wc.sendTransaction.mockRejectedValueOnce(new Error("User rejected the request."));
    await expect(sendEvmExternal(wc, { chainId: 84532, to: TO, amount: 1n })).rejects.toThrow(
      /rejected/i,
    );
  });
});
