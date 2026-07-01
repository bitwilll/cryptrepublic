import "client-only";
import { parseEther, formatEther, formatUnits, getAddress, isAddress } from "viem";
import * as btc from "@scure/btc-signer";

/** Unit conversions + address validation shared by the wallet read/send layers. */

const LAMPORTS_PER_SOL = 9; // decimals
const SATS_PER_BTC = 8; // decimals

export function weiToEth(wei: bigint): string {
  return formatEther(wei);
}

export function ethToWei(eth: string): bigint {
  return parseEther(eth);
}

export function lamportsToSol(lamports: bigint): string {
  return formatUnits(lamports, LAMPORTS_PER_SOL);
}

export function satsToBtc(sats: bigint): string {
  return formatUnits(sats, SATS_PER_BTC);
}

export function isValidEvmAddress(address: string): boolean {
  return isAddress(address);
}

export function toChecksumAddress(address: string): `0x${string}` {
  return getAddress(address);
}

// Solana public keys are 32 bytes base58-encoded (32–44 chars, base58 alphabet).
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isValidSolanaAddress(address: string): boolean {
  if (address.length < 32 || address.length > 44) return false;
  return BASE58_RE.test(address);
}

export function isValidBtcAddress(address: string): boolean {
  // Try both networks; a valid mainnet OR testnet native-segwit address passes.
  for (const net of [btc.NETWORK, btc.TEST_NETWORK]) {
    try {
      btc.Address(net).decode(address);
      return true;
    } catch {
      // try the other network
    }
  }
  return false;
}
