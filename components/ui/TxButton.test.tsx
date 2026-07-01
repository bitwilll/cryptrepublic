// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TxButton } from "./TxButton";

/**
 * TxButton state-machine tests. idle -> (requireReady gate) -> pending/mining ->
 * success (explorer link + onSuccess) OR error (revert in role="alert"). Renders
 * disabledReason when disabled and the TESTNET/SIMULATED chips when flagged.
 */

const HASH = "0xabc0000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;

describe("TxButton", () => {
  it("gate: requireReady=false opens the gate and does NOT call onRun", async () => {
    const onRun = vi.fn(async () => HASH);
    const requireReady = vi.fn(() => false);
    render(<TxButton label="Cast vote" onRun={onRun} requireReady={requireReady} />);
    fireEvent.click(screen.getByRole("button", { name: /cast vote/i }));
    expect(requireReady).toHaveBeenCalled();
    expect(onRun).not.toHaveBeenCalled();
  });

  it("success: a resolving onRun transitions to success, shows the explorer link, calls onSuccess", async () => {
    const onRun = vi.fn(async () => HASH);
    const onSuccess = vi.fn();
    render(
      <TxButton
        label="Claim"
        onRun={onRun}
        onSuccess={onSuccess}
        explorerBase="https://explorer.example"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /claim/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(HASH));
    const link = await screen.findByRole("link", { name: /view|explorer|transaction/i });
    expect(link).toHaveAttribute("href", `https://explorer.example/tx/${HASH}`);
  });

  it("error: a rejecting onRun renders the revert message in role=alert and NEVER shows success", async () => {
    const onRun = vi.fn(async () => {
      throw new Error("already voted");
    });
    const onSuccess = vi.fn();
    render(<TxButton label="Cast vote" onRun={onRun} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /cast vote/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already voted/i);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("disabled: renders the disabledReason and does not run", () => {
    const onRun = vi.fn(async () => HASH);
    render(
      <TxButton
        label="Cast vote"
        onRun={onRun}
        disabled
        disabledReason="Mint your passport to participate"
      />,
    );
    expect(screen.getByText(/mint your passport to participate/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cast vote/i }));
    expect(onRun).not.toHaveBeenCalled();
  });

  it("renders TESTNET and SIMULATED chips when flagged", () => {
    const onRun = vi.fn(async () => HASH);
    render(<TxButton label="Claim" onRun={onRun} testnet simulated />);
    expect(screen.getByText(/testnet/i)).toBeInTheDocument();
    expect(screen.getByText(/simulated/i)).toBeInTheDocument();
  });
});
