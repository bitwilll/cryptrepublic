import "client-only";
import { isMainnet } from "@/lib/config/chain";

/**
 * Swap/bridge is USER-SIGNED and non-custodial (LI.FI primary, 0x fallback) —
 * the server NEVER signs or custodies. This wave ships a thin, clearly-labeled
 * TESTNET MOCK only: on testnet `getSwapQuote` returns a mock quote (no real
 * execution); on mainnet it throws until the real aggregator lands in a later
 * wave. The same `NEXT_PUBLIC_CHAIN_ENV` switch un-gates mainnet.
 */
export interface MockQuote {
  mock: true;
  label: "TESTNET MOCK";
  fromToken: string;
  toToken: string;
  estOut: string;
}

export async function getSwapQuote(
  fromToken: string,
  toToken: string,
  amount: bigint,
): Promise<MockQuote> {
  if (isMainnet) {
    throw new Error("LI.FI/0x swap/bridge integration lands in a later wave.");
  }
  // Deterministic, obviously-fake 1:1-minus-fee quote so the UI can render a
  // labeled preview without any real aggregator call.
  const estOut = ((amount * 99n) / 100n).toString();
  return { mock: true, label: "TESTNET MOCK", fromToken, toToken, estOut };
}
