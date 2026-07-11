// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { InvestApp } from "./InvestApp";

/**
 * InvestApp tests (Wave 16 invest). fetch is mocked per-URL. Asserts:
 * - the four-register tab bar renders and switching tabs swaps the panel
 *   (arrow keys walk the tablist, store keyboard pattern)
 * - INVEST renders a project card (mono amounts, creator, progress, the
 *   non-custodial notice under the pledge form) and the official empty state
 * - the ENDORSEMENT QUEUE shows the endorse toggle with aria-pressed, the
 *   community-backed badge at 7, and "Your filing — awaiting the Cabinet"
 *   on the caller's own filing
 * - pledge withdrawal is two-step: nothing POSTs before the confirm press
 */

const h = vi.hoisted(() => ({
  active: { projects: [] as unknown[] },
  submitted: { projects: [] as unknown[] },
  pledges: { pledges: [] as unknown[] },
  posts: [] as Array<{ url: string; method: string; body: unknown }>,
}));

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

beforeEach(() => {
  h.active = { projects: [] };
  h.submitted = { projects: [] };
  h.pledges = { pledges: [] };
  h.posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        h.posts.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return jsonRes({ ok: true });
      }
      if (url.includes("/api/invest/projects?status=SUBMITTED")) return jsonRes(h.submitted);
      if (url.includes("/api/invest/projects?mine=1")) return jsonRes({ projects: [] });
      if (url.includes("/api/invest/pledges")) return jsonRes(h.pledges);
      if (url.includes("/api/invest/projects")) return jsonRes(h.active);
      throw new Error(`unmocked fetch ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const project = {
  id: "prj1",
  title: "Harbour beacon",
  summary: "A solar navigation beacon for the harbour mouth.",
  category: "INFRASTRUCTURE",
  goalCoin: "2500.00",
  treasuryAddress: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
  status: "ACTIVE",
  createdAt: "2026-07-01T10:00:00.000Z",
  creatorDisplay: "Citizen № 42",
  pledgedTotalCoin: "1250.00",
  pledgeCount: 3,
  endorsementCount: 0,
  communityBacked: false,
  myPledge: null as unknown,
  myEndorsement: false,
  mine: false,
};

describe("InvestApp — tabs", () => {
  it("renders all four registers and switches panels (mouse + arrow keys)", async () => {
    render(<InvestApp />);
    for (const key of ["invest", "queue", "pledges", "fundraiser"]) {
      expect(screen.getByTestId(`invest-tab-${key}`)).toBeTruthy();
    }
    expect(screen.getByTestId("invest-tab-invest").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByTestId("invest-tab-pledges"));
    await waitFor(() => expect(screen.getByTestId("pledges-empty")).toBeTruthy());
    expect(screen.getByTestId("invest-tab-pledges").getAttribute("aria-selected")).toBe("true");

    // arrow-key walk: pledges → fundraiser
    fireEvent.keyDown(screen.getByTestId("invest-tab-pledges"), { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getByTestId("invest-tab-fundraiser").getAttribute("aria-selected")).toBe(
        "true",
      ),
    );
  });
});

describe("InvestApp — invest board", () => {
  it("renders a project card with mono amounts, progress, and the non-custodial notice", async () => {
    h.active.projects = [project];
    render(<InvestApp />);
    await waitFor(() => expect(screen.getByTestId("project-card")).toBeTruthy());
    expect(screen.getByText("Harbour beacon")).toBeTruthy();
    expect(screen.getByText("Citizen № 42")).toBeTruthy();
    expect(screen.getByTestId("pledged-line").textContent).toBe(
      "1 250.00 $CRYPT of 2 500.00 $CRYPT",
    );
    expect(screen.getByText("3 citizens pledged")).toBeTruthy();
    expect(screen.getByTestId("treasury-addr").textContent).toBe(project.treasuryAddress);
    expect(screen.getByTestId("copy-treasury-btn")).toBeTruthy();
    // pledge form present (no pledge yet) with the notice beneath it
    const form = screen.getByTestId("pledge-form");
    expect(
      within(form).getByText(
        /Pledges are recorded commitments — settlement is wallet-to-wallet; the Republic never holds funds\./,
      ),
    ).toBeTruthy();
  });

  it("shows the official empty state when the board is clear", async () => {
    render(<InvestApp />);
    await waitFor(() =>
      expect(screen.getByTestId("invest-empty").textContent).toMatch(/No active fundraisers/),
    );
  });

  it("withdrawing a pledge is two-step: no POST until the confirm press", async () => {
    h.active.projects = [
      { ...project, myPledge: { amountCoin: "100.00", note: null, status: "PLEDGED" } },
    ];
    render(<InvestApp />);
    await waitFor(() => expect(screen.getByTestId("my-pledge-block")).toBeTruthy());
    expect(screen.getByText("100.00 $CRYPT")).toBeTruthy();

    fireEvent.click(screen.getByTestId("withdraw-pledge-btn"));
    expect(h.posts).toHaveLength(0); // confirmation gate — nothing sent yet

    fireEvent.click(screen.getByTestId("withdraw-pledge-confirm-btn"));
    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toBe("/api/invest/pledges/withdraw");
    expect(h.posts[0]!.body).toEqual({ projectId: "prj1" });
  });
});

describe("InvestApp — endorsement queue", () => {
  it("shows the endorse toggle (aria-pressed), the badge at 7, and the own-filing note", async () => {
    h.submitted.projects = [
      {
        ...project,
        id: "prjQ",
        status: "SUBMITTED",
        endorsementCount: 3,
        myEndorsement: true,
      },
      {
        ...project,
        id: "prjB",
        title: "Backed archive",
        status: "SUBMITTED",
        endorsementCount: 7,
        communityBacked: true,
        mine: true,
      },
    ];
    render(<InvestApp />);
    fireEvent.click(screen.getByTestId("invest-tab-queue"));
    await waitFor(() => expect(screen.getAllByTestId("queue-card")).toHaveLength(2));

    const [first, second] = screen.getAllByTestId("queue-card");
    const toggle = within(first!).getByTestId("endorse-btn");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.textContent).toBe("Withdraw endorsement");
    expect(within(first!).getByTestId("endorsement-count").textContent).toBe("3 of 7 endorsements");

    // own filing: no endorse button, the Cabinet note, and the gold badge at 7
    expect(within(second!).queryByTestId("endorse-btn")).toBeNull();
    expect(within(second!).getByTestId("own-filing-note").textContent).toBe(
      "Your filing — awaiting the Cabinet.",
    );
    expect(within(second!).getByText("Community-backed")).toBeTruthy();

    // toggling fires DELETE (already endorsed)
    fireEvent.click(toggle);
    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.method).toBe("DELETE");
    expect(h.posts[0]!.url).toBe("/api/invest/projects/prjQ/endorse");
  });
});
