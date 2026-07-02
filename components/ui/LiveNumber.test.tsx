// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LiveNumber } from "./LiveNumber";

/**
 * LiveNumber honors prefers-reduced-motion (renders the final value with no
 * count-up) and stays null-safe when `window.matchMedia` does not exist at all
 * (jsdom has none by default and vitest.setup.ts adds no polyfill — the guard
 * must be optional-chained, per Wave 8 post-review addendum 4).
 */

class IONoop {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("LiveNumber", () => {
  const originalMatchMedia = window.matchMedia;
  const originalIO = globalThis.IntersectionObserver;

  beforeEach(() => {
    globalThis.IntersectionObserver = IONoop as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    globalThis.IntersectionObserver = originalIO;
    vi.useRealTimers();
  });

  it("renders the final value immediately under prefers-reduced-motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as typeof window.matchMedia;

    render(<LiveNumber value={48392} />);
    // No 0 frame persisted: the reduced-motion guard snaps straight to 48 392.
    expect(screen.getByText("48 392")).toBeInTheDocument();
  });

  it("settles without throwing when window.matchMedia does not exist", () => {
    vi.useFakeTimers();
    // jsdom default: no matchMedia at all — the guard must not throw.
    // @ts-expect-error — deliberately removing the API for the null-safety test
    delete window.matchMedia;

    render(<LiveNumber value={1234} />);
    // The IntersectionObserver stub never fires; the 2.5s failsafe snaps to the
    // final value.
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.getByText("1 234")).toBeInTheDocument();
  });
});
