// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PassportStatus } from "@/lib/passport/client";
import { PassportAssetCard } from "./PassportAssetCard";

/**
 * PassportAssetCard tests. It is a DISTINCT soulbound card (not an AssetRow):
 * a citizen sees a NON-TRANSFERABLE badge and NO send/transfer control; a
 * non-citizen sees the mint link; and the `unavailable` prop (finding #14 —
 * unregistered-chain graceful degradation) renders a subdued unavailable state
 * rather than crashing.
 */

describe("PassportAssetCard", () => {
  it("citizen: shows the token, a SOULBOUND badge, and NO transfer control", () => {
    const passport: PassportStatus = { isCitizen: true, tokenId: 42n };
    render(<PassportAssetCard passport={passport} unavailable={false} />);
    expect(screen.getByTestId("passport-token")).toHaveTextContent("Citizen #42");
    expect(screen.getByTestId("soulbound-badge")).toHaveTextContent(/non-transferable/i);
    // A soulbound SBT must never expose send / transfer / bridge / sell.
    expect(
      screen.queryByRole("button", { name: /send|transfer|bridge|sell/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("passport-mint-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("passport-unavailable")).not.toBeInTheDocument();
  });

  it("non-citizen: shows the mint link and no token/badge", () => {
    const passport: PassportStatus = { isCitizen: false };
    render(<PassportAssetCard passport={passport} unavailable={false} />);
    const link = screen.getByTestId("passport-mint-link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard/mint");
    expect(screen.queryByTestId("passport-token")).not.toBeInTheDocument();
    expect(screen.queryByTestId("soulbound-badge")).not.toBeInTheDocument();
  });

  it("unavailable: renders a graceful state, no token/badge/mint link (finding #14)", () => {
    render(<PassportAssetCard passport={null} unavailable={true} />);
    expect(screen.getByTestId("passport-unavailable")).toHaveTextContent(/unavailable/i);
    expect(screen.queryByTestId("passport-token")).not.toBeInTheDocument();
    expect(screen.queryByTestId("soulbound-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("passport-mint-link")).not.toBeInTheDocument();
  });
});
