/**
 * Wave 16 — pledge money math. Amounts are DECIMAL STRINGS end to end
 * (validated by lib/validation/invest.ts: 1..8 integer digits, at most 2
 * decimal places, > 0). All arithmetic happens in BigInt CENTS — never
 * floats — so pledge totals stay exact at any scale the Registry reaches.
 * Client-safe: pure string/BigInt work, no server imports.
 */

/** "128.5" → 12850n; "0.01" → 1n; "10000000" → 1000000000n. */
export function coinToCents(coin: string): bigint {
  const [whole = "", frac = ""] = coin.split(".");
  const cents = (frac + "00").slice(0, 2);
  return BigInt(whole || "0") * 100n + BigInt(cents || "0");
}

/** 12850n → "128.50"; 0n → "0.00". Cents are never negative in this ledger. */
export function centsToCoin(cents: bigint): string {
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

/** Exact decimal-string sum of pledge amounts. Empty list → "0.00". */
export function sumCoin(coins: readonly string[]): string {
  let total = 0n;
  for (const c of coins) total += coinToCents(c);
  return centsToCoin(total);
}
