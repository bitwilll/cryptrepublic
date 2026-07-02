// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * AdminShell tests (Wave 9 C1). Asserts the back-office shell decision:
 * - the 7 admin nav items render with correct hrefs
 * - the ADMIN badge renders (data-testid="admin-badge")
 * - the back-to-dashboard link points to /dashboard
 * - NO citizen-card and NO mint affordance (absence — the whole reason
 *   AdminShell is not DashboardShell: no SessionCitizenProvider, no citizen
 *   affordances, no wallet/passport polling)
 * - the active nav item derives from usePathname (aria-current)
 * - the burger toggles the mobile drawer backdrop
 */

const h = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => h.pathname,
}));

import { AdminShell } from "./AdminShell";

const NAV = [
  ["Overview", "/admin"],
  ["Users", "/admin/users"],
  ["Applications", "/admin/applications"],
  ["Content", "/admin/content"],
  ["Flags", "/admin/flags"],
  ["Chain actions", "/admin/chain"],
  ["Audit", "/admin/audit"],
] as const;

beforeEach(() => {
  h.pathname = "/admin";
});

describe("AdminShell", () => {
  it("renders the 7 admin nav items with correct hrefs", () => {
    render(
      <AdminShell adminEmail="root@cryptrepublic.local">
        <div>child</div>
      </AdminShell>,
    );
    for (const [label, href] of NAV) {
      const link = screen.getByRole("link", { name: new RegExp(`^${label}$`, "i") });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("renders the ADMIN badge and the signed-in admin email", () => {
    render(
      <AdminShell adminEmail="root@cryptrepublic.local">
        <div>child</div>
      </AdminShell>,
    );
    expect(screen.getByTestId("admin-badge")).toHaveTextContent(/admin/i);
    expect(screen.getByText("root@cryptrepublic.local")).toBeInTheDocument();
  });

  it("links back to the dashboard", () => {
    render(
      <AdminShell adminEmail={null}>
        <div>child</div>
      </AdminShell>,
    );
    const back = screen.getByRole("link", { name: /back to dashboard/i });
    expect(back).toHaveAttribute("href", "/dashboard");
  });

  it("mounts NO citizen card and NO mint affordance (back-office, not DashboardShell)", () => {
    render(
      <AdminShell adminEmail={null}>
        <div>child</div>
      </AdminShell>,
    );
    expect(screen.queryByTestId("citizen-card")).not.toBeInTheDocument();
    expect(screen.queryByText(/mint a passport/i)).not.toBeInTheDocument();
  });

  it("derives the active nav item from usePathname", () => {
    h.pathname = "/admin/users";
    render(
      <AdminShell adminEmail={null}>
        <div>child</div>
      </AdminShell>,
    );
    expect(screen.getByRole("link", { name: /^Users$/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /^Overview$/i })).not.toHaveAttribute("aria-current");
  });

  it("marks Overview active ONLY on /admin exactly (no prefix-match false positive)", () => {
    h.pathname = "/admin";
    render(
      <AdminShell adminEmail={null}>
        <div>child</div>
      </AdminShell>,
    );
    expect(screen.getByRole("link", { name: /^Overview$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("burger toggles the mobile drawer backdrop", () => {
    render(
      <AdminShell adminEmail={null}>
        <div>child</div>
      </AdminShell>,
    );
    expect(screen.queryByTestId("nav-backdrop")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(screen.getByTestId("nav-backdrop")).toBeInTheDocument();
  });

  it("renders its children", () => {
    render(
      <AdminShell adminEmail={null}>
        <div data-testid="child-content">child</div>
      </AdminShell>,
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });
});
