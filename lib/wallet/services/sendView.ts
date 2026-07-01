import "client-only";
import { formatUnits, getAddress } from "viem";
import type { SendPreview } from "./send";
import { tokensForChain, type TokenEntry } from "@/config/tokens";
import { contractEntry } from "@/config/contracts";
import { evmEntry } from "@/config/chains.config";

/**
 * Send-confirm view model. Turns a RAW `SendPreview` (base-unit strings) into a
 * human-readable confirm and provides the COMPLETE sendable-token set.
 *
 * ROOT-CAUSE FIX (findings #1/#2/#7): $CRYPT lives in contractEntry(chainId).token,
 * NOT config/tokens.ts (address-less placeholder). Any send code resolving ERC-20
 * metadata from tokensForChain ALONE throws for $CRYPT. `sendableTokens` unions
 * them and MUST be the single source of sendable-token metadata for the whole
 * SEND flow (this VM AND the SendModal picker).
 */

export interface SendConfirmVM {
  to: `0x${string}`; // checksummed
  chainName: string; // viemChain.name via evmEntry
  chainId: number;
  tokenSymbol: string; // "ETH"/native symbol or the resolved ERC-20 symbol
  amountDisplay: string; // formatUnits(raw, decimals) — human units
  feeDisplay: string; // formatUnits(feeWei, 18) native units
  feeSymbol: string; // native currency symbol
}

/**
 * The COMPLETE sendable ERC-20 set for a chain: tokensForChain(chainId) (address-
 * less placeholders dropped) UNIONed with the registered $CRYPT entry from
 * contractEntry(chainId).token (symbol "CRYPT", 18 decimals). $CRYPT is appended
 * ONLY when `token` is set; de-duped by lowercased address. Read the non-throwing
 * `contractEntry(...).token` directly — never a throwing accessor (finding #14).
 */
export function sendableTokens(chainId: number): readonly TokenEntry[] {
  const base = tokensForChain(chainId).filter(
    (t): t is TokenEntry & { address: `0x${string}` } => t.address !== undefined,
  );
  const cryptToken = contractEntry(chainId).token;
  if (!cryptToken) return base;

  const already = base.some((t) => t.address?.toLowerCase() === cryptToken.toLowerCase());
  if (already) return base;
  const cryptEntry: TokenEntry = { symbol: "CRYPT", decimals: 18, address: cryptToken };
  return [...base, cryptEntry];
}

/** Resolve token metadata (symbol + decimals) for a SendPreview.token value. */
function resolveToken(chainId: number, token: string): { symbol: string; decimals: number } {
  if (token === "native") {
    const native = evmEntry(chainId).viemChain.nativeCurrency;
    return { symbol: native.symbol, decimals: native.decimals };
  }
  const found = sendableTokens(chainId).find(
    (t) => t.address?.toLowerCase() === token.toLowerCase(),
  );
  if (!found) {
    throw new Error(`Unknown send token ${token} on chain ${chainId}`);
  }
  return { symbol: found.symbol, decimals: found.decimals };
}

/** Turn a raw SendPreview into a human-readable confirm view model. */
export function toSendConfirmVM(preview: SendPreview): SendConfirmVM {
  const to = getAddress(preview.to); // throws on a bad recipient (checksum guard)
  const native = evmEntry(preview.chainId).viemChain.nativeCurrency;
  const { symbol, decimals } = resolveToken(preview.chainId, preview.token);
  return {
    to,
    chainName: evmEntry(preview.chainId).viemChain.name,
    chainId: preview.chainId,
    tokenSymbol: symbol,
    amountDisplay: formatUnits(BigInt(preview.amount), decimals),
    feeDisplay: formatUnits(BigInt(preview.feeEstimate), native.decimals),
    feeSymbol: native.symbol,
  };
}
