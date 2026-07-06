// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PassportPreview } from "./PassportPreview";

describe("PassportPreview", () => {
  it("static (default) renders the face with a QR and no flip control", () => {
    render(<PassportPreview no="7" name="CITIZEN №7" domicile="Lisbon" issued="BLK 100" />);
    expect(screen.getByText("CITIZEN №7")).toBeInTheDocument();
    expect(screen.getByText("Lisbon")).toBeInTheDocument();
    expect(screen.getByTestId("passport-qr")).toBeInTheDocument(); // unique QR on the face
    expect(screen.queryByTestId("passport-flip")).not.toBeInTheDocument();
  });

  it("the reverse carries a UNIQUE generative NFT (deterministic per identity)", () => {
    const { unmount } = render(
      <PassportPreview flippable identity="0xAAA" no="—" name="A" issued="PENDING" />,
    );
    const artA = screen.getByTestId("passport-nft").innerHTML;
    unmount();
    render(<PassportPreview flippable identity="0xBBB" no="—" name="B" issued="PENDING" />);
    const artB = screen.getByTestId("passport-nft").innerHTML;
    expect(artA).not.toBe(artB); // different holders → different NFT art
  });

  it("flippable exposes an accessible flip button whose aria-pressed toggles on click", () => {
    render(
      <PassportPreview
        flippable
        no="—"
        name="NOVA APPLICANT"
        domicile="Lisbon"
        motto="code is law"
        issued="TO BE MINTED"
      />,
    );
    const flip = screen.getByTestId("passport-flip");
    // Accessible name + initial state.
    expect(flip).toHaveAttribute("aria-label", expect.stringMatching(/flip/i));
    expect(flip).toHaveAttribute("aria-pressed", "false");

    // Both faces are in the DOM (the reverse is CSS-hidden, not unmounted).
    expect(within(flip).getByText("NOVA APPLICANT")).toBeInTheDocument(); // face
    expect(within(flip).getByText(/SOULBOUND · NON-TRANSFERABLE/)).toBeInTheDocument(); // reverse
    // The motto is featured on BOTH faces (the front row + the reverse).
    expect(within(flip).getAllByText("code is law")).toHaveLength(2);

    fireEvent.click(flip);
    expect(flip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(flip);
    expect(flip).toHaveAttribute("aria-pressed", "false");
  });

  it("the reverse shows a neutral motto default when none is declared", () => {
    render(<PassportPreview flippable no="—" name="PENDING CITIZEN" issued="PENDING" />);
    expect(screen.getByText(/Civis Cryptrepublicae/)).toBeInTheDocument();
  });
});
