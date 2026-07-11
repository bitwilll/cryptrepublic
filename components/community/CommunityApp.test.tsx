// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CommunityApp } from "./CommunityApp";

/**
 * CommunityApp tests (Wave 17). fetch is mocked per-URL. Asserts:
 * - the Civic ID card renders my own CR-… handle;
 * - the MESSAGES thread renders bubbles (mine vs theirs, sender micro-label
 *   Civic ID + display), the honesty line, and the composer sends on Enter
 *   (shift+Enter stays a newline);
 * - ADD CITIZEN auto-uppercases, blocks a malformed Civic ID client-side
 *   (no POST fired), and files a valid request with the normalized payload.
 */

const MY_CIVIC_ID = "CR-AAAA-AAAA".replace(/A/g, "B"); // CR-BBBB-BBBB — alphabet-safe
const PEER_CIVIC_ID = "CR-CCCC-DDDD";

const h = vi.hoisted(() => ({
  me: {} as unknown,
  conversations: { conversations: [] as unknown[] },
  messages: { messages: [] as unknown[], nextCursor: null as string | null },
  connections: { incoming: [], outgoing: [], accepted: [] } as unknown,
  posts: [] as Array<{ url: string; body: unknown }>,
  postResponse: { ok: true, status: 200, body: {} as unknown },
}));

function jsonRes(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => data } as Response;
}

beforeEach(() => {
  h.me = { civicId: MY_CIVIC_ID, connectionCounts: { incoming: 0, outgoing: 0, accepted: 0 } };
  h.conversations = { conversations: [] };
  h.messages = { messages: [], nextCursor: null };
  h.connections = { incoming: [], outgoing: [], accepted: [] };
  h.posts = [];
  h.postResponse = { ok: true, status: 200, body: { ok: true } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        h.posts.push({ url, body: JSON.parse(String(init.body)) });
        return jsonRes(h.postResponse.body, h.postResponse.status);
      }
      if (url.includes("/api/community/me")) return jsonRes(h.me);
      if (url.includes("/messages")) return jsonRes(h.messages);
      if (url.includes("/api/community/conversations")) return jsonRes(h.conversations);
      if (url.includes("/api/community/connections")) return jsonRes(h.connections);
      throw new Error(`unmocked fetch ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const directConvo = {
  conversationId: "cv1",
  kind: "DIRECT",
  title: "Citizen № 42",
  mineIsCreator: false,
  members: [
    { civicId: MY_CIVIC_ID, display: "Applicant", mine: true },
    { civicId: PEER_CIVIC_ID, display: "Citizen № 42", mine: false },
  ],
  lastMessage: { excerpt: "See you at the assembly", at: "2026-07-01T10:00:00.000Z", mine: false },
  unread: 2,
  lastActivityAt: "2026-07-01T10:00:00.000Z",
};

describe("CommunityApp — Civic ID card + conversation list", () => {
  it("renders my Civic ID with a copy control and the unread pill", async () => {
    h.conversations = { conversations: [directConvo] };
    render(<CommunityApp />);
    await waitFor(() => expect(screen.getByTestId("my-civic-id").textContent).toBe(MY_CIVIC_ID));
    expect(screen.getByTestId("copy-civic-id")).toBeTruthy();
    expect(
      screen.getByText(/Share it to be added as friend or family — it reveals nothing else/),
    ).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("conversation-row")).toBeTruthy());
    expect(screen.getByTestId("unread-pill").textContent).toMatch(/2 new/i);
    expect(screen.getByText("Citizen № 42")).toBeTruthy();
  });
});

describe("CommunityApp — thread + composer", () => {
  it("renders bubbles with sender micro-labels and the honesty line; Enter sends, Shift+Enter does not", async () => {
    h.conversations = { conversations: [directConvo] };
    h.messages = {
      messages: [
        // API is newest-first; the thread displays oldest → newest.
        {
          id: "m2",
          body: "Mine, later",
          at: "2026-07-01T10:05:00.000Z",
          sender: { civicId: MY_CIVIC_ID, display: "Applicant", mine: true },
        },
        {
          id: "m1",
          body: "Theirs, earlier",
          at: "2026-07-01T10:00:00.000Z",
          sender: { civicId: PEER_CIVIC_ID, display: "Citizen № 42", mine: false },
        },
      ],
      nextCursor: null,
    };
    render(<CommunityApp />);
    await waitFor(() => expect(screen.getByTestId("conversation-row")).toBeTruthy());
    fireEvent.click(screen.getByTestId("conversation-row"));

    await waitFor(() => expect(screen.getByTestId("thread-view")).toBeTruthy());
    expect(screen.getByTestId("bubble-mine").textContent).toContain("Mine, later");
    expect(screen.getByTestId("bubble-theirs").textContent).toContain("Theirs, earlier");
    // sender micro-label: Civic ID + display for THEIR bubble, "You" for mine
    expect(screen.getByTestId("bubble-theirs").textContent).toContain(
      `Citizen № 42 · ${PEER_CIVIC_ID}`,
    );
    expect(screen.getByTestId("bubble-mine").textContent).toContain("You");
    expect(
      screen.getByText("Messages are stored by the registry and are not end-to-end encrypted."),
    ).toBeTruthy();

    const composer = screen.getByTestId("composer-input");
    fireEvent.change(composer, { target: { value: "First line" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(h.posts).toHaveLength(0); // shift+enter = newline, no send

    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toContain("/api/community/messages");
    expect(h.posts[0]!.body).toEqual({ conversationId: "cv1", body: "First line" });
  });
});

describe("CommunityApp — add citizen", () => {
  it("auto-uppercases, blocks malformed ids client-side, and files the normalized request", async () => {
    render(<CommunityApp />);
    await waitFor(() => expect(screen.getByTestId("my-civic-id")).toBeTruthy());
    fireEvent.click(screen.getByTestId("community-tab-add"));

    expect(
      screen.getByText(/Ask a citizen for their Civic ID — it is on their passport/),
    ).toBeTruthy();

    const input = screen.getByTestId("civic-id-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "cr-bcdf" } });
    expect(input.value).toBe("CR-BCDF"); // auto-uppercase as you type

    fireEvent.blur(input);
    await waitFor(() =>
      expect(screen.getByText(/Enter a Civic ID in the form CR-XXXX-XXXX/)).toBeTruthy(),
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");

    fireEvent.click(screen.getByTestId("add-citizen-submit"));
    expect(h.posts).toHaveLength(0); // invalid — nothing filed

    fireEvent.change(input, { target: { value: "cr-2345-bcdf" } });
    expect(input.value).toBe("CR-2345-BCDF");
    fireEvent.change(screen.getByTestId("kind-select"), { target: { value: "FAMILY" } });
    fireEvent.change(screen.getByTestId("greeting-input"), {
      target: { value: "It is me, your cousin." },
    });
    h.postResponse = { ok: true, status: 200, body: { ok: true, filed: true } };
    fireEvent.click(screen.getByTestId("add-citizen-submit"));

    await waitFor(() => expect(h.posts).toHaveLength(1));
    expect(h.posts[0]!.url).toContain("/api/community/connections");
    expect(h.posts[0]!.body).toEqual({
      civicId: "CR-2345-BCDF",
      kind: "FAMILY",
      greeting: "It is me, your cousin.",
    });
    await waitFor(() => expect(screen.getByText(/Request filed to CR-2345-BCDF/)).toBeTruthy());
    expect(input.value).toBe(""); // cleared for the next filing
  });

  it("surfaces the server's 404 verdict in the persistent status region", async () => {
    render(<CommunityApp />);
    await waitFor(() => expect(screen.getByTestId("my-civic-id")).toBeTruthy());
    fireEvent.click(screen.getByTestId("community-tab-add"));

    const input = screen.getByTestId("civic-id-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "CR-2345-BCDF" } });
    h.postResponse = { ok: false, status: 404, body: { error: "No citizen holds that Civic ID." } };
    fireEvent.click(screen.getByTestId("add-citizen-submit"));

    await waitFor(() => expect(screen.getByText("No citizen holds that Civic ID.")).toBeTruthy());
  });
});
