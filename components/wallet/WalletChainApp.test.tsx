// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * WalletChainApp orchestrator tests. Every service module + the embedded session
 * are mocked so the loading / locked / populated states render without a live
 * chain. Asserts: the total, at least one token row, the REAL chain name (never
 * "CR-L2"/"7331"), the rendered representative-price disclaimer (finding #8), the
 * STAKE button disabled when staking unavailable, and graceful render when the
 * passport/staking accessors throw (unregistered chain — finding #14).
 */

const h = vi.hoisted(() => ({
  hasVault: true,
  unlocked: false,
  stakingAvailable: true,
  portfolioThrows: false,
  passportThrows: false,
  stakeThrows: false,
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  isUnlocked: () => h.unlocked,
  getAccounts: () => ({
    evm: "0x00000000000000000000000000000000000000A1",
    solana: "So",
    bitcoin: "tb1",
  }),
  loadPublicAccounts: async () => ({
    evm: "0x00000000000000000000000000000000000000A1",
    solana: "So",
    bitcoin: "tb1",
  }),
  unlock: async () => ({
    evm: "0x00000000000000000000000000000000000000A1",
    solana: "So",
    bitcoin: "tb1",
  }),
  startAutoLock: () => () => {},
}));

vi.mock("@/lib/wallet/embedded/storage", () => ({
  hasVault: async () => h.hasVault,
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 84532 }),
}));

vi.mock("@/lib/wallet/services/portfolio", () => ({
  REPRESENTATIVE_PRICES: { ETH: 3240, CRYPT: 1 },
  loadPortfolio: async () => {
    if (h.portfolioThrows) throw new Error("rpc down");
    return {
      totalUsd: 3241,
      assets: [
        {
          symbol: "ETH",
          decimals: 18,
          raw: 10n ** 18n,
          formatted: "1",
          usdPrice: 3240,
          usdValue: 3240,
        },
        {
          symbol: "CRYPT",
          decimals: 18,
          raw: 10n ** 18n,
          formatted: "1",
          address: "0xcrypt",
          usdPrice: 1,
          usdValue: 1,
        },
      ],
    };
  },
}));

vi.mock("@/lib/wallet/services/chainStats", () => ({
  readChainStats: async () => ({
    chainId: 84532,
    chainName: "Base Sepolia",
    blockNumber: 999n,
    gasMaxFeePerGasWei: 1_000_000_000n,
    explorerBase: "https://sepolia.basescan.org",
    representativeNote:
      "Validators, TPS, and finality are not measurable on this network and are omitted.",
  }),
}));

vi.mock("@/lib/wallet/services/staking", () => ({
  stakingAvailable: () => h.stakingAvailable,
  readStakePosition: async () => {
    if (h.stakeThrows) throw new Error("Staking not deployed");
    return {
      staked: 0n,
      earned: 0n,
      aprBps: 1180,
      totalStaked: 0n,
      rewardPoolRemaining: 0n,
    };
  },
  readCryptAllowance: async () => 0n,
  approveCryptEmbedded: async () => "0xhash",
  stakeEmbedded: async () => "0xhash",
  unstakeEmbedded: async () => "0xhash",
  claimEmbedded: async () => "0xhash",
}));

vi.mock("@/lib/passport/client", () => ({
  readPassportStatus: async () => {
    if (h.passportThrows) throw new Error("Passport not deployed on chain 84532");
    return { isCitizen: false };
  },
}));

vi.mock("@/lib/wallet/services/history", () => ({
  evmHistory: async () => [],
}));

vi.mock("@/lib/wallet/receive", () => ({
  receiveQrDataUrl: async () => "data:image/png;base64,QQ==",
}));

import { WalletChainApp } from "./WalletChainApp";

beforeEach(() => {
  h.hasVault = true;
  h.unlocked = false;
  h.stakingAvailable = true;
  h.portfolioThrows = false;
  h.passportThrows = false;
  h.stakeThrows = false;
});

describe("WalletChainApp", () => {
  it("renders a loading state initially", () => {
    render(<WalletChainApp />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows an Unlock affordance when locked", async () => {
    h.unlocked = false;
    render(<WalletChainApp />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /unlock/i })).toBeInTheDocument(),
    );
  });

  it("populated: shows the total, a token row, the REAL chain name, and the representative disclaimer", async () => {
    h.unlocked = true;
    render(<WalletChainApp />);
    // total ($3,241.00)
    await waitFor(() =>
      expect(screen.getByTestId("portfolio-total")).toHaveTextContent(/3[,\s]?241/),
    );
    // at least one token row
    expect(screen.getByTestId("token-row-ETH")).toBeInTheDocument();
    // REAL chain name, NOT CR-L2 / 7331
    expect(screen.getAllByText(/Base Sepolia/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/CR-L2/i)).toHaveLength(0);
    expect(screen.queryAllByText(/7331/)).toHaveLength(0);
    // representative-price disclaimer (finding #8/#15) — rendered near the total
    expect(screen.getByTestId("representative-disclaimer")).toHaveTextContent(
      /representative prices — not a live oracle/i,
    );
  });

  it("disables STAKE when staking is unavailable", async () => {
    h.unlocked = true;
    h.stakingAvailable = false;
    render(<WalletChainApp />);
    await waitFor(() => expect(screen.getByTestId("portfolio-total")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^stake$/i })).toBeDisabled();
  });

  it("renders gracefully (no crash) when passport + staking accessors throw", async () => {
    h.unlocked = true;
    h.passportThrows = true;
    h.stakeThrows = true;
    render(<WalletChainApp />);
    // The screen still renders the total (no thrown render).
    await waitFor(() => expect(screen.getByTestId("portfolio-total")).toBeInTheDocument());
  });
});
