// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import {
  prepareGrantRole,
  prepareOpenEpochBatch,
  prepareDisburseProposal,
  type SafeTxBuilderJson,
} from "@/lib/admin/prepare";

/**
 * PreparedActionCard tests (Wave 9 C4 + post-review addenda #3/#4).
 * The fixtures are REAL prepare.ts artifacts (env-neutral pure encoders), so
 * what the card renders is byte-faithful to what D1 proves on anvil. Asserts:
 * - decoded summary + to + chainId render
 * - COPY writes the exact calldata to the (mocked) clipboard
 * - the Safe Tx Builder JSON download parses (version "1.0", string chainId,
 *   transactions matching the batch)
 * - the MANDATED never-signs banner renders — Safe-batch variant
 * - a 2-tx batch renders both txs in order
 * - a GovernanceProposalPayload renders the two-prerequisites note, the
 *   descriptionHash, a COPY for the propose() calldata, NO Safe-JSON button,
 *   and the GOVERNANCE-PROPOSAL banner variant (same testid)
 * - the REQUIRED ROLE + confirmed holders + would-revert warning (addendum #3)
 */

const STAKING = "0x00000000000000000000000000000000000000a1" as const;
const TOKEN = "0x00000000000000000000000000000000000000b2" as const;
const DISTRIBUTOR = "0x00000000000000000000000000000000000000c3" as const;
const GOVERNANCE = "0x00000000000000000000000000000000000000d4" as const;
const TREASURY = "0x00000000000000000000000000000000000000e5" as const;
const ACCOUNT = "0x00000000000000000000000000000000000000f6" as const;
const HOLDER = "0x0000000000000000000000000000000000000ab1" as const;

import { PreparedActionCard } from "./PreparedActionCard";

const clipboard = vi.hoisted(() => ({ texts: [] as string[] }));
const blobs: Blob[] = [];

/** jsdom's Blob has no .text() — read via FileReader. */
function blobText(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
}

beforeEach(() => {
  clipboard.texts = [];
  blobs.length = 0;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async (t: string) => {
        clipboard.texts.push(t);
      }),
    },
  });
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return "blob:mock";
  });
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PreparedActionCard — Safe batches", () => {
  const single = prepareGrantRole(31337, "staking", STAKING, "REWARDS_ADMIN_ROLE", ACCOUNT);

  it("renders the decoded summary, to, and chainId", () => {
    render(<PreparedActionCard prepared={single} />);
    expect(screen.getByText(/grantRole\(REWARDS_ADMIN_ROLE/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(STAKING))).toBeInTheDocument();
    expect(screen.getByText(/31337/)).toBeInTheDocument();
  });

  it("COPY writes the exact calldata to the clipboard", async () => {
    render(<PreparedActionCard prepared={single} />);
    fireEvent.click(screen.getByRole("button", { name: /copy calldata/i }));
    await waitFor(() => expect(clipboard.texts).toHaveLength(1));
    expect(clipboard.texts[0]).toBe(single.txs[0].data);
  });

  it("downloads a Safe Tx Builder JSON matching the batch", async () => {
    render(<PreparedActionCard prepared={single} />);
    fireEvent.click(screen.getByRole("button", { name: /download safe tx builder json/i }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    const parsed = JSON.parse(await blobText(blobs[0])) as SafeTxBuilderJson;
    expect(parsed.version).toBe("1.0");
    expect(parsed.chainId).toBe("31337");
    expect(typeof parsed.chainId).toBe("string");
    expect(parsed.transactions).toEqual(
      single.txs.map((t) => ({ to: t.to, value: t.value, data: t.data })),
    );
  });

  it("renders the MANDATED Safe-batch never-signs banner", () => {
    render(<PreparedActionCard prepared={single} />);
    expect(screen.getByTestId("never-signs-label")).toHaveTextContent(
      "PREPARED FOR YOUR SAFE — THIS PANEL NEVER SIGNS",
    );
  });

  it("renders a 2-tx batch with both txs in order", () => {
    const batch = prepareOpenEpochBatch(31337, TOKEN, DISTRIBUTOR, 1000n);
    render(<PreparedActionCard prepared={batch} />);
    const txs = screen.getAllByTestId("prepared-tx");
    expect(txs).toHaveLength(2);
    expect(txs[0]).toHaveTextContent(/1\./);
    expect(txs[0]).toHaveTextContent(/approve\(/);
    expect(txs[1]).toHaveTextContent(/2\./);
    expect(txs[1]).toHaveTextContent(/openEpoch\(1000\)/);
  });

  it("annotates the REQUIRED ROLE with confirmed holders (addendum #3)", () => {
    render(
      <PreparedActionCard
        prepared={single}
        requiredRole={{ contract: "staking", role: "DEFAULT_ADMIN_ROLE", holders: [HOLDER] }}
      />,
    );
    const roleNote = screen.getByTestId("required-role");
    expect(roleNote).toHaveTextContent(/DEFAULT_ADMIN_ROLE/);
    expect(roleNote).toHaveTextContent(new RegExp(HOLDER));
    expect(roleNote).toHaveTextContent(/revert/i);
  });

  it("warns of a guaranteed revert when there are NO confirmed holders", () => {
    render(
      <PreparedActionCard
        prepared={single}
        requiredRole={{ contract: "staking", role: "DEFAULT_ADMIN_ROLE", holders: [] }}
      />,
    );
    expect(screen.getByTestId("required-role")).toHaveTextContent(/no confirmed holders.*revert/i);
  });
});

describe("PreparedActionCard — governance proposal payloads", () => {
  const payload = prepareDisburseProposal(
    31337,
    GOVERNANCE,
    TREASURY,
    TOKEN,
    ACCOUNT,
    500n,
    "wave9 c4 disburse test",
  );

  it("renders the two-prerequisites note, the descriptionHash, and the proposal banner variant", () => {
    render(<PreparedActionCard prepared={payload} />);
    expect(screen.getByTestId("never-signs-label")).toHaveTextContent(
      "PREPARED AS A GOVERNANCE-PROPOSAL PAYLOAD — NOT A SAFE TRANSACTION — THIS PANEL NEVER SIGNS",
    );
    const note = screen.getByTestId("proposal-note");
    expect(note).toHaveTextContent(/CITIZEN wallet/i);
    expect(note).toHaveTextContent(/NotCitizen/);
    expect(note).toHaveTextContent(/GovernanceProposalContent/);
    expect(screen.getByText(payload.descriptionHash)).toBeInTheDocument();
  });

  it("copies the FULL propose() calldata addressed to the governance contract", async () => {
    render(<PreparedActionCard prepared={payload} />);
    const proposeSection = screen.getByTestId("propose-artifact");
    expect(proposeSection).toHaveTextContent(new RegExp(GOVERNANCE));
    fireEvent.click(within(proposeSection).getByRole("button", { name: /copy propose/i }));
    await waitFor(() => expect(clipboard.texts).toHaveLength(1));
    expect(clipboard.texts[0]).toBe(payload.propose.data);
  });

  it("offers NO Safe-JSON export (not a Safe transaction) and says why", () => {
    render(<PreparedActionCard prepared={payload} />);
    expect(
      screen.queryByRole("button", { name: /download safe tx builder json/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/no Safe export/i)).toBeInTheDocument();
  });
});
