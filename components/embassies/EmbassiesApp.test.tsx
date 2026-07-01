// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { keccak256, stringToHex } from "viem";
import { canonicalEmbassyContent } from "@/lib/validation/dashboard";

/**
 * EmbassiesApp tests. `useCitizen`, `useChainInfo`, the embedded session, the
 * proposeEmbedded writer, and the `/api/embassies` fetch are mocked. Asserts
 * (§7.12, constraint #4/#5):
 * - the grid renders from /api/embassies (seeded directory)
 * - a card links to /dashboard/embassies/[code]
 * - "PROPOSE AN EMBASSY" is DISABLED with a mint nudge for a non-citizen
 * - for a citizen it opens the modal, and submitting calls proposeEmbedded FIRST
 *   then POSTs the returned proposalId/txHash + the canonical content whose
 *   keccak256 equals the descriptionHash
 */

const h = vi.hoisted(() => ({
  isCitizen: true,
  tokenId: 7n as bigint | null,
  embassies: [] as Array<Record<string, unknown>>,
  proposeArgs: null as null | [number, `0x${string}`, bigint, `0x${string}`, `0x${string}`],
  postedBody: null as Record<string, unknown> | null,
  order: [] as string[],
}));

vi.mock("@/components/shell/SessionCitizenProvider", () => ({
  useCitizen: () => ({
    address: "0x00000000000000000000000000000000000000A1",
    isCitizen: h.isCitizen,
    tokenId: h.tokenId,
    loading: false,
    refresh: () => {},
  }),
}));

vi.mock("@/lib/hooks/useChainInfo", () => ({
  useChainInfo: () => ({
    chainId: 31337,
    chainName: "Anvil",
    blockNumber: 100n,
    gasMaxFeePerGasWei: null,
    explorerBase: null,
    online: true,
  }),
}));

vi.mock("@/lib/config/chain", () => ({
  activeChain: () => ({ primaryChainId: 31337 }),
}));

vi.mock("@/lib/wallet/embedded/session", () => ({
  isUnlocked: () => true,
  unlock: async () => ({ evm: "0x00000000000000000000000000000000000000A1" }),
}));

vi.mock("@/lib/governance/write", () => ({
  proposeEmbedded: async (
    chainId: number,
    target: `0x${string}`,
    value: bigint,
    callData: `0x${string}`,
    descriptionHash: `0x${string}`,
  ) => {
    h.order.push("propose");
    h.proposeArgs = [chainId, target, value, callData, descriptionHash];
    return { txHash: "0xproposehash" as `0x${string}`, proposalId: 3n };
  },
}));

const originalFetch = globalThis.fetch;

import { EmbassiesApp } from "./EmbassiesApp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.isCitizen = true;
  h.tokenId = 7n;
  h.embassies = [];
  h.proposeArgs = null;
  h.postedBody = null;
  h.order = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/embassies/proposals")) {
      h.order.push("post");
      h.postedBody = init?.body ? JSON.parse(String(init.body)) : null;
      return jsonResponse({ ok: true, proposalContentId: "c1", txHash: "0xproposehash" });
    }
    if (url.includes("/api/embassies")) {
      return jsonResponse({ embassies: h.embassies });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const EMB = [
  {
    code: "LIS",
    name: "Lisbon",
    neighborhood: "Avenida da Liberdade",
    hours: "Mon–Sun · 09–22 WET",
    foundedAt: "2024.11.04",
    brandColor: "#7cffa6",
    city: "Lisbon",
    country: "Portugal",
  },
];

describe("EmbassiesApp", () => {
  it("renders the grid from /api/embassies (seeded directory)", async () => {
    h.embassies = EMB;
    render(<EmbassiesApp />);
    await waitFor(() => expect(screen.getByText(/Lisbon/)).toBeInTheDocument());
    expect(screen.getByText(/Avenida da Liberdade/)).toBeInTheDocument();
  });

  it("a card links to /dashboard/embassies/[code]", async () => {
    h.embassies = EMB;
    render(<EmbassiesApp />);
    const link = await screen.findByRole("link", { name: /view embassy/i });
    expect(link).toHaveAttribute("href", "/dashboard/embassies/LIS");
  });

  it("PROPOSE AN EMBASSY is DISABLED with a mint nudge for a non-citizen", async () => {
    h.isCitizen = false;
    h.tokenId = null;
    render(<EmbassiesApp />);
    const propose = await screen.findByRole("button", { name: /propose an embassy/i });
    expect(propose).toBeDisabled();
    expect(screen.getByText(/mint your passport/i)).toBeInTheDocument();
  });

  it("a citizen opens the modal; submit proposes ON-CHAIN FIRST then POSTs proposalId/txHash + matching content", async () => {
    h.embassies = EMB;
    render(<EmbassiesApp />);
    const propose = await screen.findByRole("button", { name: /propose an embassy/i });
    expect(propose).not.toBeDisabled();
    fireEvent.click(propose);

    // fill the modal fields
    fireEvent.change(screen.getByTestId("propose-code"), { target: { value: "BCN" } });
    fireEvent.change(screen.getByTestId("propose-name"), { target: { value: "Barcelona" } });
    fireEvent.change(screen.getByTestId("propose-neighborhood"), { target: { value: "Gràcia" } });
    fireEvent.change(screen.getByTestId("propose-city"), { target: { value: "Barcelona" } });
    fireEvent.change(screen.getByTestId("propose-country"), { target: { value: "Spain" } });

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^propose\b/i }));

    await waitFor(() => expect(h.postedBody).not.toBeNull());

    // on-chain propose BEFORE the off-chain POST
    expect(h.order).toEqual(["propose", "post"]);

    // proposeEmbedded called with (chainId, 0x0, 0n, "0x", descriptionHash)
    const content = canonicalEmbassyContent({
      code: "BCN",
      name: "Barcelona",
      neighborhood: "Gràcia",
      city: "Barcelona",
      country: "Spain",
    });
    const expectedHash = keccak256(stringToHex(content));
    expect(h.proposeArgs?.[1]).toBe("0x0000000000000000000000000000000000000000");
    expect(h.proposeArgs?.[2]).toBe(0n);
    expect(h.proposeArgs?.[3]).toBe("0x");
    expect(h.proposeArgs?.[4]).toBe(expectedHash);

    // the POST carries the returned proposalId + txHash + the content
    expect(h.postedBody?.proposalId).toBe("3");
    expect(h.postedBody?.txHash).toBe("0xproposehash");
    expect(h.postedBody?.code).toBe("BCN");
  });
});
