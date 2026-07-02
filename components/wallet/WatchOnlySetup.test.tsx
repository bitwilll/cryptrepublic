// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  setCalls: [] as unknown[],
}));

vi.mock("@/lib/wallet/mode", () => ({
  setWalletMode: vi.fn(async (meta: unknown) => {
    h.setCalls.push(meta);
  }),
}));

import { WatchOnlySetup } from "./WatchOnlySetup";
import { WatchOnlyBadge } from "./WatchOnlyBadge";

const SUM = "0x1111111111111111111111111111111111111111";

beforeEach(() => {
  h.setCalls = [];
});

describe("WatchOnlySetup", () => {
  it("rejects an invalid address inline — nothing persisted", async () => {
    const onConfigured = vi.fn();
    render(<WatchOnlySetup onConfigured={onConfigured} />);
    fireEvent.change(screen.getByTestId("watch-address-input"), {
      target: { value: "not-an-address" },
    });
    fireEvent.click(screen.getByTestId("watch-address-save"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not a valid/i));
    expect(h.setCalls).toHaveLength(0);
    expect(onConfigured).not.toHaveBeenCalled();
  });

  it("persists a valid checksummed address via setWalletMode", async () => {
    const onConfigured = vi.fn();
    render(<WatchOnlySetup onConfigured={onConfigured} />);
    fireEvent.change(screen.getByTestId("watch-address-input"), { target: { value: SUM } });
    fireEvent.click(screen.getByTestId("watch-address-save"));
    await waitFor(() => expect(onConfigured).toHaveBeenCalledWith(SUM));
    expect(h.setCalls[0]).toEqual({ mode: "watchonly", watchAddress: SUM });
  });

  it("accepts + normalizes a lowercased valid address (getAddress checksum)", async () => {
    const mixed = "0x00000000000000000000000000000000000000a1";
    const checksummed = "0x00000000000000000000000000000000000000A1";
    const onConfigured = vi.fn();
    render(<WatchOnlySetup onConfigured={onConfigured} />);
    fireEvent.change(screen.getByTestId("watch-address-input"), { target: { value: mixed } });
    fireEvent.click(screen.getByTestId("watch-address-save"));
    await waitFor(() => expect(onConfigured).toHaveBeenCalledWith(checksummed));
  });
});

describe("WatchOnlyBadge", () => {
  it("renders the WATCH-ONLY label with role=status", () => {
    render(<WatchOnlyBadge />);
    const badge = screen.getByTestId("watchonly-badge");
    expect(badge).toHaveAttribute("role", "status");
    expect(badge).toHaveTextContent(/WATCH-ONLY/);
    expect(badge).toHaveTextContent(/no keys/i);
  });
});
