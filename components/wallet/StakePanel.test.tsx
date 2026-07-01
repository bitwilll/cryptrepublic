// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { StakePosition } from "@/lib/wallet/services/staking";

/**
 * StakePanel tests. The staking service is mocked. Asserts APR = aprBps/100 %;
 * allowance-skip; approve-BEFORE-stake ordering AND that approve FULLY RESOLVES
 * before stake is invoked (TOCTOU — finding #6, deferred-promise); the CLAIM cap
 * note; max-approve default OFF; and the disabled/unavailable state.
 */

const h = vi.hoisted(() => ({
  allowance: 0n,
  approveOrder: [] as string[],
  stakeOrder: [] as string[],
  approveResolve: null as null | (() => void),
  approveArgs: null as null | [number, bigint],
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  getAccounts: () => ({ evm: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" }),
}));

vi.mock("@/lib/wallet/services/staking", () => ({
  readCryptAllowance: async () => h.allowance,
  approveCryptEmbedded: (chainId: number, amount: bigint) => {
    h.approveArgs = [chainId, amount];
    h.approveOrder.push("approve");
    return new Promise<`0x${string}`>((resolve) => {
      h.approveResolve = () => resolve("0xapprove");
    });
  },
  stakeEmbedded: async () => {
    h.stakeOrder.push("stake");
    return "0xstake" as `0x${string}`;
  },
  unstakeEmbedded: async () => "0xunstake" as `0x${string}`,
  claimEmbedded: async () => "0xclaim" as `0x${string}`,
}));

import { StakePanel } from "./StakePanel";

const POSITION: StakePosition = {
  staked: 100n * 10n ** 18n,
  earned: 5n * 10n ** 18n,
  aprBps: 1180,
  totalStaked: 1000n * 10n ** 18n,
  rewardPoolRemaining: 3n * 10n ** 18n,
};

beforeEach(() => {
  h.allowance = 0n;
  h.approveOrder = [];
  h.stakeOrder = [];
  h.approveResolve = null;
  h.approveArgs = null;
});

describe("StakePanel", () => {
  it("renders APR as aprBps/100 %", () => {
    render(
      <StakePanel
        chainId={31337}
        available
        position={POSITION}
        requireUnlock={() => true}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByTestId("apr")).toHaveTextContent("11.8%");
  });

  it("renders a graceful unavailable state when staking is unavailable", () => {
    render(
      <StakePanel
        chainId={31337}
        available={false}
        position={null}
        requireUnlock={() => true}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByTestId("stake-unavailable")).toBeInTheDocument();
  });

  it("SKIPS approve when allowance already covers the amount", async () => {
    h.allowance = 1000n * 10n ** 18n; // covers 1
    render(
      <StakePanel
        chainId={31337}
        available
        position={POSITION}
        requireUnlock={() => true}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^stake$/i }));
    fireEvent.change(screen.getByTestId("stake-amount-input"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("confirm-stake"));
    await waitFor(() => expect(h.stakeOrder).toEqual(["stake"]));
    expect(h.approveOrder).toEqual([]); // approve skipped
  });

  it("approves the EXACT amount BEFORE stake, and stake waits for approve to RESOLVE (TOCTOU)", async () => {
    h.allowance = 0n; // needs approve
    render(
      <StakePanel
        chainId={31337}
        available
        position={POSITION}
        requireUnlock={() => true}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^stake$/i }));
    fireEvent.change(screen.getByTestId("stake-amount-input"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("confirm-stake"));

    // approve fired; stake NOT yet (approve promise is still pending)
    await waitFor(() => expect(h.approveOrder).toEqual(["approve"]));
    expect(h.stakeOrder).toEqual([]);
    // exact amount (1 * 1e18), never max
    expect(h.approveArgs?.[1]).toBe(10n ** 18n);
    expect(h.approveArgs?.[1]).not.toBe(2n ** 256n - 1n);

    // now resolve approve → stake proceeds
    h.approveResolve?.();
    await waitFor(() => expect(h.stakeOrder).toEqual(["stake"]));
  });

  it("max-approve toggle defaults OFF", () => {
    render(
      <StakePanel
        chainId={31337}
        available
        position={POSITION}
        requireUnlock={() => true}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^stake$/i }));
    const toggle = screen.getByTestId("max-approve-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it("CLAIM confirm mentions the reward-pool cap and does NOT promise full earned", () => {
    render(
      <StakePanel
        chainId={31337}
        available
        position={POSITION}
        requireUnlock={() => true}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^claim$/i }));
    const note = screen.getByTestId("claim-cap-note");
    expect(note).toHaveTextContent(/capped by the reward pool/i);
    expect(note).toHaveTextContent(/may be less than earned/i);
  });

  it("does NOT stake when locked (requireUnlock false)", async () => {
    render(
      <StakePanel
        chainId={31337}
        available
        position={POSITION}
        requireUnlock={() => false}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^stake$/i }));
    fireEvent.change(screen.getByTestId("stake-amount-input"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("confirm-stake"));
    await new Promise((r) => setTimeout(r, 20));
    expect(h.approveOrder).toEqual([]);
    expect(h.stakeOrder).toEqual([]);
  });
});
