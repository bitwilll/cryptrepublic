// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { encodeFunctionData, erc20Abi } from "viem";
import { buildCall } from "./call";

const TO = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;

describe("buildCall (signer-free call.ts)", () => {
  it("native → {to: recipient, value: amount} with no data", () => {
    expect(buildCall({ chainId: 84532, to: TO, amount: 7n })).toEqual({ to: TO, value: 7n });
  });

  it("ERC-20 → {to: TOKEN CONTRACT, value: 0n, data: transfer(recipient, amount)}", () => {
    const call = buildCall({ chainId: 84532, to: TO, amount: 5n, token: TOKEN });
    expect(call.to).toBe(TOKEN);
    expect(call.value).toBe(0n);
    expect(call.data).toBe(
      encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [TO, 5n] }),
    );
  });

  it("call.ts imports NO embedded module (the signer-free guarantee)", () => {
    const src = readFileSync(path.resolve(__dirname, "call.ts"), "utf8");
    // Import statements only — the doc comment may NAME the boundary it enforces.
    expect(src).not.toMatch(/from\s+"@\/lib\/wallet\/embedded/);
    expect(src).not.toMatch(/from\s+"\.\.\/embedded/);
  });
});
