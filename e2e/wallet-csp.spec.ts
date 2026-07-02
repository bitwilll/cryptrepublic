import { test, expect, type Page } from "@playwright/test";

/**
 * CSP `connect-src` assertion for the /wallet route with the wagmi provider tree
 * mounted and a MOCK injected wallet present. Loading /wallet initializes wagmi +
 * react-query and the connectors (injected + WalletConnect); this test asserts
 * ZERO CSP violations for the WALLET route (not only Home/Auth), covering the
 * wallet's provider/RPC traffic under the live prod CSP.
 *
 * A minimal EIP-1193 `window.ethereum` is injected before load so the injected
 * connector detects a wallet without a real extension.
 */

function collect(page: Page) {
  const cspViolations: string[] = [];
  page.addInitScript(() => {
    const w = window as unknown as { __csp?: string[]; ethereum?: unknown };
    document.addEventListener("securitypolicyviolation", (e) => {
      (w.__csp ??= []).push(`${e.violatedDirective} :: ${e.blockedURI || "inline"}`);
    });
    // Minimal mock EIP-1193 provider (no network — just enough for detection).
    w.ethereum = {
      isMetaMask: true,
      request: async ({ method }: { method: string }) => {
        if (method === "eth_chainId") return "0x14a34"; // 84532
        if (method === "eth_accounts") return [];
        return null;
      },
      on: () => {},
      removeListener: () => {},
    };
  });
  return {
    async csp() {
      return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
    },
    cspViolations,
  };
}

test("/wallet mounts the wagmi provider tree with a mock wallet and zero CSP violations", async ({
  page,
}) => {
  const c = collect(page);
  await page.goto("/wallet", { waitUntil: "networkidle" });
  // Wave 11 A2: the mode chooser renders first; selecting EMBEDDED must also
  // stay violation-free (both views run under the same prod CSP).
  await expect(page.getByRole("heading", { name: /Choose your wallet mode/i })).toBeVisible();
  await page.getByTestId("mode-embedded").click();
  // The embedded exerciser renders (providers mounted successfully).
  await expect(page.getByRole("heading", { name: /Embedded wallet/i })).toBeVisible();
  // Give wagmi/connectors a moment to initialize any sockets/requests.
  await page.waitForTimeout(1500);

  const csp = await c.csp();
  expect(csp, `CSP violations on /wallet: ${csp.join("; ")}`).toHaveLength(0);
});
