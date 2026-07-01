import "client-only";
import { erc20Abi, formatUnits } from "viem";
import { evmBalances, type Balance } from "./balances";
import { publicClientFor } from "./evmClients";
import { contractEntry } from "@/config/contracts";

/**
 * Portfolio aggregator: native + registry ERC-20 balances (via evmBalances),
 * plus $CRYPT read from `config/contracts.ts` `token` (tokensForChain has it as
 * an address-less placeholder, so evmBalances skips it). Attaches a
 * REPRESENTATIVE static price per symbol and sums only priced, resolvable assets.
 *
 * IMPORTANT: the prices below are REPRESENTATIVE, not a live oracle. The service
 * only supplies the numbers; a VISIBLE "representative prices" disclaimer MUST
 * render in the UI next to the derived `$` total (see PortfolioHeader) — a code
 * comment alone is NOT sufficient.
 */

export interface PricedAsset extends Balance {
  /** USD unit price (representative/static in Wave 6 — no live oracle). undefined = no price. */
  usdPrice?: number;
  /** balance × price; undefined when price is unknown. */
  usdValue?: number;
}

export interface Portfolio {
  assets: PricedAsset[];
  /** Sum of usdValue over assets that HAVE a price. Never NaN. */
  totalUsd: number;
}

/**
 * Representative static prices by symbol. NOT a live oracle — these feed a
 * real-looking `$` total, so the UI MUST render a visible disclaimer near it.
 */
export const REPRESENTATIVE_PRICES: Record<string, number> = {
  ETH: 3240,
  WETH: 3240,
  WBTC: 64880,
  BTC: 64880,
  USDC: 1,
  CRYPT: 1,
  SOL: 0,
};

function priceAsset(b: Balance): PricedAsset {
  const usdPrice = REPRESENTATIVE_PRICES[b.symbol];
  if (usdPrice === undefined) {
    return { ...b };
  }
  const usdValue = Number(formatUnits(b.raw, b.decimals)) * usdPrice;
  return { ...b, usdPrice, usdValue };
}

/**
 * Reads native + registry ERC-20 balances, appends $CRYPT from
 * contractEntry(chainId).token when registered, attaches representative prices,
 * and sums resolvable values. Never NaN.
 */
export async function loadPortfolio(chainId: number, owner: `0x${string}`): Promise<Portfolio> {
  const base = await evmBalances(chainId, owner);
  const priced: PricedAsset[] = base.map(priceAsset);

  // $CRYPT lives in config/contracts.ts `token`, not tokens.ts — append it here.
  const cryptToken = contractEntry(chainId).token;
  if (cryptToken) {
    const client = publicClientFor(chainId);
    const raw = (await client.readContract({
      address: cryptToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;
    priced.push(
      priceAsset({
        symbol: "CRYPT",
        decimals: 18,
        raw,
        formatted: formatUnits(raw, 18),
        address: cryptToken,
      }),
    );
  }

  const totalUsd = priced.reduce((s, a) => s + (a.usdValue ?? 0), 0);
  return { assets: priced, totalUsd };
}
