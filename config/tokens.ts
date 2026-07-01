/**
 * Curated per-chain token registry. The single place any token address lives.
 *
 * - `CRYPT` is CryptRepublic's native governance/treasury token. Its address is
 *   a TYPED PLACEHOLDER (`undefined`) on every chain until the Wave 4 contracts
 *   registry deploys it; the balance layer SKIPS tokens with no address.
 * - `WETH`/`WBTC`/`USDC` addresses are filled per network ONLY where publicly
 *   known and stable; left `undefined` otherwise (balance layer skips them).
 * - Native coins (ETH/SOL/BTC) are NOT in this list — they are read directly by
 *   the balance layer.
 */

export interface TokenEntry {
  symbol: "CRYPT" | "WETH" | "WBTC" | "USDC";
  decimals: number;
  /** undefined = not deployed / not registered on this chain yet. */
  address?: `0x${string}`;
}

/** $CRYPT placeholder — Wave 4 fills the address via the contracts registry. */
const CRYPT_PLACEHOLDER: TokenEntry = { symbol: "CRYPT", decimals: 18, address: undefined };

export const TOKENS: Record<number, readonly TokenEntry[]> = {
  // --- Testnet ---
  // Base Sepolia (84532)
  84532: [
    CRYPT_PLACEHOLDER,
    { symbol: "WETH", decimals: 18, address: "0x4200000000000000000000000000000000000006" },
    { symbol: "WBTC", decimals: 8, address: undefined },
    // Circle USDC on Base Sepolia
    { symbol: "USDC", decimals: 6, address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
  ],
  // Ethereum Sepolia (11155111)
  11155111: [
    CRYPT_PLACEHOLDER,
    { symbol: "WETH", decimals: 18, address: undefined },
    { symbol: "WBTC", decimals: 8, address: undefined },
    { symbol: "USDC", decimals: 6, address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
  ],
  // Arbitrum Sepolia (421614)
  421614: [
    CRYPT_PLACEHOLDER,
    { symbol: "WETH", decimals: 18, address: undefined },
    { symbol: "WBTC", decimals: 8, address: undefined },
    { symbol: "USDC", decimals: 6, address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
  ],
  // OP Sepolia (11155420)
  11155420: [
    CRYPT_PLACEHOLDER,
    { symbol: "WETH", decimals: 18, address: "0x4200000000000000000000000000000000000006" },
    { symbol: "WBTC", decimals: 8, address: undefined },
    { symbol: "USDC", decimals: 6, address: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7" },
  ],
  // Polygon Amoy (80002)
  80002: [
    CRYPT_PLACEHOLDER,
    { symbol: "WETH", decimals: 18, address: undefined },
    { symbol: "WBTC", decimals: 8, address: undefined },
    { symbol: "USDC", decimals: 6, address: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582" },
  ],

  // --- Mainnet ---
  // Base (8453)
  8453: [
    CRYPT_PLACEHOLDER,
    { symbol: "WETH", decimals: 18, address: "0x4200000000000000000000000000000000000006" },
    { symbol: "WBTC", decimals: 8, address: undefined },
    { symbol: "USDC", decimals: 6, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  ],
  // Ethereum (1)
  1: [
    CRYPT_PLACEHOLDER,
    { symbol: "WETH", decimals: 18, address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
    { symbol: "WBTC", decimals: 8, address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
    { symbol: "USDC", decimals: 6, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  ],
  // Arbitrum One (42161)
  42161: [
    CRYPT_PLACEHOLDER,
    { symbol: "WETH", decimals: 18, address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" },
    { symbol: "WBTC", decimals: 8, address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" },
    { symbol: "USDC", decimals: 6, address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
  ],
  // OP Mainnet (10)
  10: [
    CRYPT_PLACEHOLDER,
    { symbol: "WETH", decimals: 18, address: "0x4200000000000000000000000000000000000006" },
    { symbol: "WBTC", decimals: 8, address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095" },
    { symbol: "USDC", decimals: 6, address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
  ],
  // Polygon (137)
  137: [
    CRYPT_PLACEHOLDER,
    { symbol: "WETH", decimals: 18, address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" },
    { symbol: "WBTC", decimals: 8, address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6" },
    { symbol: "USDC", decimals: 6, address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  ],
};

export function tokensForChain(chainId: number): readonly TokenEntry[] {
  return TOKENS[chainId] ?? [];
}
