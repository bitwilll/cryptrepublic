// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NewListingForm } from "./NewListingForm";

/**
 * NewListingForm tests (Wave 15 store). Asserts the LIVE validation mirrors
 * the zod rules (title 4..80, description 20..2000, price decimal <= 2 dp,
 * 0 < p <= 10,000,000), that an invalid form never POSTs, and that a valid
 * filing POSTs the exact body and renders the filing receipt.
 */

const h = vi.hoisted(() => ({
  posts: [] as Array<{ url: string; body: Record<string, unknown> }>,
}));

beforeEach(() => {
  h.posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      h.posts.push({ url: String(input), body });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          listing: {
            id: "lst-new",
            title: body.title,
            description: body.description,
            category: body.category,
            priceCoin: body.priceCoin,
            status: "ACTIVE",
            createdAt: "2026-07-07T09:00:00.000Z",
          },
        }),
      } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fill(testid: string, value: string) {
  fireEvent.change(screen.getByTestId(testid), { target: { value } });
  fireEvent.blur(screen.getByTestId(testid));
}

describe("NewListingForm", () => {
  it("surfaces live field errors mirroring the zod bounds and blocks the POST", async () => {
    render(<NewListingForm />);
    fill("title-input", "abc");
    expect(screen.getByText(/at least 4 characters/i)).toBeTruthy();
    fill("description-input", "too short");
    expect(screen.getByText(/at least 20 characters/i)).toBeTruthy();

    const priceError = () => document.getElementById("listing-price-error")?.textContent ?? "";
    for (const [bad, msg] of [
      ["1.234", /at most 2 decimal places/i],
      ["abc", /at most 2 decimal places/i],
      ["0", /greater than zero/i],
      ["10000001", /cannot exceed 10,000,000/i],
    ] as const) {
      fill("price-input", bad);
      expect(priceError(), bad).toMatch(msg);
    }

    fireEvent.submit(screen.getByTestId("new-listing-form"));
    await waitFor(() => expect(h.posts).toHaveLength(0));
  });

  it("a valid filing POSTs the trimmed body and shows the filing receipt", async () => {
    render(<NewListingForm />);
    fill("title-input", "  Ceremonial flag  ");
    fill(
      "description-input",
      "A full-size ceremonial flag of the Republic, kept in mint condition.",
    );
    fireEvent.change(screen.getByTestId("category-select"), { target: { value: "COLLECTIBLES" } });
    fill("price-input", "128.00");
    fireEvent.submit(screen.getByTestId("new-listing-form"));

    await waitFor(() => expect(screen.getByTestId("filing-receipt")).toBeTruthy());
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]!.url).toBe("/api/store/listings");
    expect(h.posts[0]!.body).toEqual({
      title: "Ceremonial flag",
      description: "A full-size ceremonial flag of the Republic, kept in mint condition.",
      category: "COLLECTIBLES",
      priceCoin: "128.00",
    });
    expect(screen.getByText("lst-new")).toBeTruthy();
    expect(screen.getByText("128.00 $CRYPT")).toBeTruthy();
    expect(
      screen
        .getByText(/View the listing/i)
        .closest("a")
        ?.getAttribute("href"),
    ).toBe("/dashboard/store/lst-new");
  });
});
