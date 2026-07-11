// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NewProjectForm } from "./NewProjectForm";

/**
 * NewProjectForm tests (Wave 16 invest). Asserts the LIVE validation mirrors
 * createProjectSchema (title 4..80, summary 20..280, description 40..4000,
 * goal decimal string, treasury EIP-55 checksum via viem), that an invalid
 * form never POSTs, and that a valid filing POSTs the exact body and renders
 * the SUBMITTED receipt with the endorsements → Cabinet explanation and the
 * non-custodial notice.
 */

const CHECKSUMMED = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";

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
          project: {
            id: "prj-new",
            title: body.title,
            category: body.category,
            goalCoin: body.goalCoin,
            treasuryAddress: body.treasuryAddress ?? null,
            status: "SUBMITTED",
            createdAt: "2026-07-12T09:00:00.000Z",
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
function fillValid() {
  fill("project-title-input", "Harbour beacon");
  fill("project-summary-input", "A solar navigation beacon for the harbour mouth.");
  fill(
    "project-description-input",
    "Fabricate and install a solar-powered navigation beacon at the harbour mouth, maintained by volunteers.",
  );
  fill("project-goal-input", "2500.00");
}

describe("NewProjectForm", () => {
  it("surfaces live field errors mirroring the zod bounds and blocks the POST", async () => {
    render(<NewProjectForm />);
    fill("project-title-input", "abc");
    expect(screen.getByText(/at least 4 characters/i)).toBeTruthy();
    fill("project-summary-input", "too short");
    expect(screen.getByText(/at least 20 characters/i)).toBeTruthy();
    fill("project-description-input", "not forty characters");
    expect(screen.getByText(/at least 40 characters/i)).toBeTruthy();

    const goalError = () => document.getElementById("project-goal-error")?.textContent ?? "";
    for (const [bad, msg] of [
      ["1.234", /at most 2 decimal places/i],
      ["abc", /at most 2 decimal places/i],
      ["0", /greater than zero/i],
      ["10000001", /cannot exceed 10,000,000/i],
    ] as const) {
      fill("project-goal-input", bad);
      expect(goalError(), bad).toMatch(msg);
    }

    fireEvent.submit(screen.getByTestId("new-project-form"));
    await waitFor(() => expect(h.posts).toHaveLength(0));
  });

  it("rejects a treasury address that fails its EIP-55 checksum", async () => {
    render(<NewProjectForm />);
    fillValid();
    const treasuryError = () =>
      document.getElementById("project-treasury-error")?.textContent ?? "";
    fill("project-treasury-input", CHECKSUMMED.toLowerCase()); // valid hex, wrong case
    expect(treasuryError()).toMatch(/EIP-55 checksum/i);
    fill("project-treasury-input", "0x1234"); // not an address at all
    expect(treasuryError()).toMatch(/0x… EVM address/i);

    fireEvent.submit(screen.getByTestId("new-project-form"));
    await waitFor(() => expect(h.posts).toHaveLength(0));
  });

  it("a valid filing POSTs the trimmed body (treasury omitted when blank) and shows the receipt", async () => {
    render(<NewProjectForm />);
    fillValid();
    fireEvent.change(screen.getByTestId("project-category-select"), {
      target: { value: "TECHNOLOGY" },
    });
    fireEvent.submit(screen.getByTestId("new-project-form"));

    await waitFor(() => expect(screen.getByTestId("project-receipt")).toBeTruthy());
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]!.url).toBe("/api/invest/projects");
    expect(h.posts[0]!.body).toEqual({
      title: "Harbour beacon",
      summary: "A solar navigation beacon for the harbour mouth.",
      description:
        "Fabricate and install a solar-powered navigation beacon at the harbour mouth, maintained by volunteers.",
      category: "TECHNOLOGY",
      goalCoin: "2500.00",
    });

    // the receipt explains the path and carries the non-custodial notice
    expect(screen.getByText("prj-new")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText(/endorsement queue/i)).toBeTruthy();
    expect(screen.getByText(/Cabinet/)).toBeTruthy();
    expect(
      screen.getByText(/settlement is wallet-to-wallet; the Republic never holds funds/i),
    ).toBeTruthy();
  });

  it("includes a checksummed treasury address in the POST body when provided", async () => {
    render(<NewProjectForm />);
    fillValid();
    fill("project-treasury-input", CHECKSUMMED);
    fireEvent.submit(screen.getByTestId("new-project-form"));
    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.body.treasuryAddress).toBe(CHECKSUMMED);
  });
});
