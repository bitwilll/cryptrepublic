# CryptRepublic Wave 1 — Scaffold + Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the one-app Next.js + TypeScript monorepo skeleton (web app, Prisma, Foundry, e2e), port the CryptRepublic design system, and re-render the marketing Home page as real React components — all building, typechecking, linting, and smoke-testing green in CI.

**Architecture:** A single Next.js (App Router) + TypeScript application holds the marketing site, dashboard (later waves), backend API (later waves), and Prisma DB access; an in-repo Foundry workspace (`contracts/`) targets Base / Base Sepolia (later waves). This wave establishes the skeleton, the shared design tokens/primitives, the marketing Home port, and the three test harnesses (Vitest, Playwright, Foundry) each running a smoke test.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5 (strict), pnpm, Prisma 6 (SQLite in dev), Vitest + @testing-library/react, Playwright, Foundry (forge/anvil), ESLint + Prettier, `next/font` for Archivo + IBM Plex Mono. Node 20+.

## Global Constraints

_Every task's requirements implicitly include this section. Values copied from the spec (`docs/superpowers/specs/2026-07-01-cryptrepublic-network-state-design.md`)._

- **One deployable Next.js App Router + TypeScript app**; TypeScript `strict: true`; no `any` in committed code.
- **Package manager: pnpm**; exact-version lockfile; CI uses `pnpm install --frozen-lockfile`.
- **Node 20+.**
- **Chain config is swappable via one switch:** `NEXT_PUBLIC_CHAIN_ENV=testnet|mainnet`. No file hardcodes an RPC URL, chainId, or contract address — all come from a config registry. (Registry is stubbed this wave, populated later.)
- **Non-custodial invariant (structural, enforced from day one):** the server never receives, derives, or stores any seed phrase, private key, or plaintext password. Wallet crypto is client-only (`import 'client-only'`). The Prisma schema has **no** column for secrets; a CI grep guards this.
- **Secrets are server-side only.** Anything named `NEXT_PUBLIC_*` must contain nothing sensitive.
- **Design system (exact):** fonts **Archivo** (sans) + **IBM Plex Mono** (mono); palette `--navy:#0a1929`, `--blue:#1957d3`, `--gold:#c8a96a`, `--paper:#f6f7f9`, `--ink:#0f1f33`; **squared corners** (`border-radius:0`); uppercase headings; monospace data/labels; octagonal **CR** seal. The existing `Home.html` at repo root is the pixel source of truth for the port.
- **Testing:** Foundry for contracts, Vitest for TS units, Playwright for e2e. Frequent commits (one per task minimum). Conventional-commit messages.
- **The design-tool artifacts** at repo root (`CryptRepublic.html`, `design-canvas.jsx`, `image-slot.js`, `tweaks-panel.jsx`, `home-tweaks.jsx`, `landing*.jsx`, `dash-*.jsx`) are **reference only** — they are NOT copied into `app/`. The finished HTML pages (`Home.html`, `Auth.html`, `Dashboard.html`, `Mobile.html`) are the visual source of truth for ports.

---

## File Structure (created this wave)

```
cryptrepublic/                         # = repo root (existing folder "CryptRepublic Web")
├── package.json, pnpm-lock.yaml, tsconfig.json, next.config.ts,
│   .eslintrc / eslint.config.mjs, .prettierrc, .gitignore, .env.example, .nvmrc
├── vitest.config.ts, vitest.setup.ts, playwright.config.ts
├── app/
│   ├── layout.tsx                     # root layout: fonts, theme, <html>/<body>
│   ├── globals.css                    # imports tokens.css + base styles
│   └── page.tsx                       # Home (ported from Home.html); chrome composed inline
│                                      #   ((marketing)/ route group deferred until teaser pages)
├── components/
│   ├── ui/                            # Button, Card, Seal, Kicker, StatTile, LiveNumber
│   └── marketing/                     # GovStrip, SiteHeader, HeroPassport, LiveTicker,
│                                      #   Pillars, HoldingsStrip, GovernanceStrip,
│                                      #   EmbassiesStrip, Testimonials, FinalCTA, SiteFooter
├── lib/
│   ├── config/chain.ts                # chain-env registry stub (typed, no hardcoded addrs)
│   └── hooks/                         # useReveal, usePassportBook, useGenerativeArt (client)
├── styles/tokens.css                  # :root design tokens (from Home.html <style>)
├── prisma/schema.prisma               # datasource + generator + Health model (stub)
├── contracts/                         # Foundry workspace (forge init) — Counter smoke only
├── e2e/home.spec.ts                   # Playwright smoke for Home
├── test/smoke.test.ts                 # Vitest smoke
├── docs/superpowers/…                 # spec + this plan (already present)
└── .github/workflows/{web,foundry,e2e}.yml
```

Legacy `.html`/`.jsx`/`.js` design files stay at repo root as reference (git-tracked) but are excluded from the Next build via `next.config.ts` (they are not under `app/`).

---

### Task 1: Initialize repo, Next.js + TypeScript app, and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc`, `.gitignore`, `.nvmrc`, `.env.example`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (temporary placeholder), `test/smoke.test.ts`, `vitest.config.ts`, `vitest.setup.ts`
- Reference: `Home.html` (repo root)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a building Next.js app; `pnpm dev/build/typecheck/lint/test` scripts; the `app/` App Router root layout exporting `metadata` and a root `<html lang="en">` shell.

- [ ] **Step 1: Initialize git and Node version pin**

```bash
cd "/Users/justcurious/Desktop/CryptRepublic Web"
git init
printf "20\n" > .nvmrc
corepack enable && corepack prepare pnpm@latest --activate
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
.next/
out/
dist/
coverage/
*.log
.env
.env.*.local
.env.testnet
.env.mainnet
prisma/dev.db
prisma/dev.db-journal
/contracts/out/
/contracts/cache/
/contracts/broadcast/
.DS_Store
/test-results/
/playwright-report/
/.playwright/
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "cryptrepublic",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "guard:secrets": "bash scripts/guard-no-secret-columns.sh"
  },
  "dependencies": {
    "next": "15.1.0",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "@types/node": "20.16.0",
    "@types/react": "19.0.0",
    "@types/react-dom": "19.0.0",
    "eslint": "9.15.0",
    "eslint-config-next": "15.1.0",
    "@eslint/eslintrc": "3.1.0",
    "prettier": "3.3.3",
    "vitest": "2.1.5",
    "@vitejs/plugin-react": "4.3.3",
    "@testing-library/react": "16.0.1",
    "@testing-library/jest-dom": "6.6.3",
    "jsdom": "25.0.1"
  }
}
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`
Expected: resolves and writes `pnpm-lock.yaml`, exit 0.

- [ ] **Step 5: Create `tsconfig.json` (strict, path alias `@/`)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "contracts", "*.jsx", "*.html", "image-slot.js"]
}
```

- [ ] **Step 6: Create `next.config.ts`** (exclude legacy design files from the build; they live at root but are not part of `app/`)

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Legacy design-tool exports (*.html, *.jsx) sit at repo root as reference only.
  // They are not imported by app/, so Next ignores them; nothing extra needed here.
  // Security headers (CSP etc.) are added in a later wave alongside the wallet.
};

export default nextConfig;
```

- [ ] **Step 7: Create `eslint.config.mjs` and `.prettierrc`**

`eslint.config.mjs` (ESLint 9 flat config via `FlatCompat` — this is what `create-next-app` emits for Next 15; do NOT call `next()` as a function, it is not callable):
```js
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
];
```
`next lint` in Next 15 reads this flat config; `pnpm lint` runs it.
`.prettierrc`:
```json
{ "semi": true, "singleQuote": false, "printWidth": 100, "trailingComma": "all" }
```

- [ ] **Step 8: Create `.env.example`** (documents the single chain switch; no secrets committed)

```bash
# Chain environment switch — the ONLY thing that flips testnet <-> mainnet
NEXT_PUBLIC_CHAIN_ENV=testnet
# Server-only secrets (never NEXT_PUBLIC_) — added in later waves:
# DATABASE_URL="file:./prisma/dev.db"
# BASE_SEPOLIA_RPC=
# ETHERSCAN_API_KEY=
```

- [ ] **Step 8b: Create the chain-config stub `lib/config/chain.ts`** (the single source for the env switch; later waves add RPCs/addresses here so nothing is hardcoded elsewhere)

```ts
export type ChainEnv = "testnet" | "mainnet";

/** The ONLY switch that flips the whole app between testnet and mainnet. */
export const CHAIN_ENV: ChainEnv =
  (process.env.NEXT_PUBLIC_CHAIN_ENV as ChainEnv) === "mainnet" ? "mainnet" : "testnet";

export const isMainnet = CHAIN_ENV === "mainnet";

// Later waves populate a typed registry keyed by CHAIN_ENV:
//   rpcUrls (server-only), chainIds, contract addresses, explorer bases.
// No RPC URL, chainId, or contract address may be hardcoded outside this module.
```

Also add a Vitest check in `test/smoke.test.ts` (append):
```ts
import { CHAIN_ENV } from "@/lib/config/chain";
it("defaults to testnet chain env", () => { expect(["testnet", "mainnet"]).toContain(CHAIN_ENV); });
```

- [ ] **Step 9: Create the root layout `app/layout.tsx`** (fonts + theme wired in Task 2; minimal shell now)

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CryptRepublic — The World's First Network State",
  description: "Become a citizen of a sovereign collective without territory.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Create a minimal `app/globals.css`** (replaced/expanded in Task 2)

```css
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; }
```

- [ ] **Step 11: Create a temporary home placeholder `app/page.tsx`** (replaced in Task 4). Per spec §2.2/§7.1 the canonical landing lives at `app/page.tsx`; the `(marketing)` route group is reserved for the secondary public teaser pages and is NOT created this wave. Do not create both an `app/page.tsx` and an `app/(marketing)/page.tsx` — that is a `/` route collision and a hard Next build error.

```tsx
export default function HomePage() {
  return <main data-testid="home-placeholder">CryptRepublic</main>;
}
```

- [ ] **Step 12: Configure Vitest — `vitest.config.ts` and `vitest.setup.ts`**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "lib/**/*.test.ts", "components/**/*.test.tsx"],
    globals: true,
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
});
```
`vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 13: Write the smoke test `test/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("arithmetic works (harness is alive)", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 14: Run the Vitest smoke test**

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 15: Run typecheck, lint, and build**

Run: `pnpm format && pnpm format:check && pnpm typecheck && pnpm lint && pnpm build`
Expected: format normalizes then `format:check` passes; typecheck exits 0; lint reports no errors; `next build` completes with the `/` route listed.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TS app, tooling, and Vitest smoke (Wave 1 Task 1)"
```

---

### Task 2: Design tokens, fonts, theme, and UI primitives

**Files:**
- Create: `styles/tokens.css`, `components/ui/Button.tsx`, `components/ui/Card.tsx`, `components/ui/Seal.tsx`, `components/ui/Kicker.tsx`, `components/ui/StatTile.tsx`, `components/ui/LiveNumber.tsx`, `components/ui/Button.test.tsx`, `components/ui/Seal.test.tsx`
- Modify: `app/globals.css`, `app/layout.tsx`
- Reference: `Home.html` `<style>` block (repo root) — copy token values + button/kicker rules verbatim.

**Interfaces:**
- Consumes: root layout from Task 1.
- Produces:
  - CSS custom properties on `:root` (see values below).
  - `<Button variant="primary"|"ghost"|"dark"|"gold" as?="a"|"button" href? className?>` — clip-path government-issue button.
  - `<Card as? className? corner?:boolean>` — squared card with optional blue corner accent.
  - `<Seal size?:number color?:string />` — octagonal CR seal SVG.
  - `<Kicker>text</Kicker>` — mono uppercase eyebrow with `▮` prefix.
  - `<StatTile value label mono?:boolean />`.
  - `<LiveNumber value prefix? suffix? />` — client component that count-ups to `value` once visible.

- [ ] **Step 1: Create `styles/tokens.css`**. First write the `:root` block exactly as below (note: font families are mapped to the `next/font` CSS variables, and `--serif` is included — both are required or the port loses its faces):

```css
:root {
  --navy:#0a1929; --navy2:#0a2540; --ink:#0f1f33;
  --blue:#1957d3; --blue-d:#0e3a9b; --cyan:#00b3e6;
  --gold:#c8a96a; --gold-d:#9d8246;
  --paper:#f6f7f9; --card:#ffffff; --line:#e5eaef;
  --muted:#5a6a7d; --success:#1f8a5b;
  /* Map to the next/font variables from app/layout.tsx so every copied rule using
     var(--sans)/var(--serif)/var(--mono) resolves to the self-hosted faces.
     --serif is used by Home.html in .hero h1 em, .pp-title, .sec-head h2 em,
     .divid .doctrine p, .vote-card h3 em, .quote p, .cta h2 em — it MUST exist. */
  --sans: var(--font-archivo), system-ui, sans-serif;
  --serif: var(--font-archivo), system-ui, sans-serif;
  --mono: var(--font-plex-mono), ui-monospace, monospace;
  --maxw:1200px;
}
```

Then, **below** the `:root` block, copy the ENTIRE component/theme CSS from `Home.html`'s `<style>` — everything from just after the original `:root` block through the end of `</style>` (`Home.html` lines ~22–343), **excluding** the original `:root` block (lines 11–21, replaced above) and the Google-Fonts `<link>` (replaced by `next/font`). This copy **MUST include**, or acceptance fails: the base/`body` rules, `.btn` clip-path rules, `.kicker`, `.wrap`, `.badge`, all heading rules, the `*{border-radius:0 !important}` line (squared corners), `.reveal` transitions, the full hero + `.passport-book` 3D transform rules, the `.pillar/.hold/.quote/.vote-card` corner-accent `::after` rules, ticker/holdings/governance/embassies/footer rules, **every `@media (max-width: …)` block** (required for the mobile pixel-close criterion), and `@media (prefers-reduced-motion: reduce)`. Do not drop any rule. (The `body` font-size/line-height/color from Home.html may duplicate `globals.css`; that is harmless.)

- [ ] **Step 2: Wire fonts + tokens in `app/layout.tsx`** using `next/font/google`

```tsx
import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["400","500","600","700","800","900"], variable: "--font-archivo" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "CryptRepublic — The World's First Network State",
  description: "Become a citizen of a sovereign collective without territory.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Update `app/globals.css`** to import tokens and set base body styles (map font CSS vars to `--sans`/`--mono`)

```css
@import "../styles/tokens.css";
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--card);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px; line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
img, svg { display: block; max-width: 100%; }
a { color: inherit; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
```

- [ ] **Step 4: Write the failing test `components/ui/Button.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a primary button with label", () => {
    render(<Button variant="primary">Mint passport</Button>);
    const el = screen.getByRole("button", { name: "Mint passport" });
    expect(el.className).toContain("btn");
    expect(el.className).toContain("btn-primary");
  });
  it("renders as an anchor when as='a' with href", () => {
    render(<Button as="a" href="/auth" variant="gold">Enter</Button>);
    const el = screen.getByRole("link", { name: "Enter" });
    expect(el).toHaveAttribute("href", "/auth");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm vitest run components/ui/Button.test.tsx`
Expected: FAIL — cannot resolve `./Button`.

- [ ] **Step 6: Implement `components/ui/Button.tsx`**

```tsx
import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "ghost" | "dark" | "gold";
type CommonProps = { variant?: Variant; className?: string; children: React.ReactNode };

type ButtonProps = CommonProps & { as?: "button" } & ComponentPropsWithoutRef<"button">;
type AnchorProps = CommonProps & { as: "a" } & ComponentPropsWithoutRef<"a">;

export function Button(props: ButtonProps | AnchorProps) {
  const { variant = "primary", className = "", children, ...rest } = props as CommonProps & Record<string, unknown>;
  const cls = `btn btn-${variant} ${className}`.trim();
  if ((props as AnchorProps).as === "a") {
    const { as: _as, ...anchorRest } = rest as Record<string, unknown>;
    return <a className={cls} {...anchorRest}>{children}</a>;
  }
  const { as: _as, ...btnRest } = rest as Record<string, unknown>;
  return <button className={cls} {...btnRest}>{children}</button>;
}
```

- [ ] **Step 7: Run the Button test to verify it passes**

Run: `pnpm vitest run components/ui/Button.test.tsx`
Expected: 2 passed.

- [ ] **Step 8: Write the failing test `components/ui/Seal.test.tsx`**

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Seal } from "./Seal";

describe("Seal", () => {
  it("renders an svg at the requested size", () => {
    const { container } = render(<Seal size={30} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("width", "30");
  });
});
```

- [ ] **Step 9: Implement `components/ui/Seal.tsx`** (octagon + CR monogram, from the footer seal in `Home.html`)

```tsx
export function Seal({ size = 30, color = "var(--gold)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <polygon points="15,1 25,5 29,15 25,25 15,29 5,25 1,15 5,5" stroke={color} strokeWidth="1.8" fill="none" />
      <text x="15" y="19.5" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill={color}>CR</text>
    </svg>
  );
}
```

- [ ] **Step 10: Run the Seal test**

Run: `pnpm vitest run components/ui/Seal.test.tsx`
Expected: 1 passed.

- [ ] **Step 11: Implement the remaining primitives** (no new tests required beyond render-safety; they are exercised by Task 4's Playwright smoke)

`components/ui/Kicker.tsx`:
```tsx
export function Kicker({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`kicker ${className}`.trim()}>{children}</div>;
}
```
`components/ui/Card.tsx`:
```tsx
import type { ComponentPropsWithoutRef } from "react";
export function Card({ corner = true, className = "", children, ...rest }: { corner?: boolean } & ComponentPropsWithoutRef<"article">) {
  return <article className={`cr-card ${corner ? "cr-card--corner" : ""} ${className}`.trim()} {...rest}>{children}</article>;
}
```
`components/ui/StatTile.tsx`:
```tsx
export function StatTile({ value, label, mono = true }: { value: React.ReactNode; label: string; mono?: boolean }) {
  return (
    <div>
      <b style={mono ? { fontFamily: "var(--mono)" } : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  );
}
```
`components/ui/LiveNumber.tsx`:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";

export function LiveNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const run = () => {
      const t0 = performance.now(), dur = 1400;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { run(); io.disconnect(); } }), { threshold: 0.5 });
    io.observe(el);
    const fallback = setTimeout(() => { setN(value); io.disconnect(); }, 2500);
    return () => { cancelAnimationFrame(raf); io.disconnect(); clearTimeout(fallback); };
  }, [value]);
  // suppressHydrationWarning: server renders 0, client animates up — the text
  // intentionally differs at hydration; without this React 19 logs an error and
  // the Playwright zero-console-errors smoke fails.
  return <b ref={ref} suppressHydrationWarning style={{ fontFamily: "var(--mono)" }}>{prefix}{n.toLocaleString("en-US").replace(/,/g, " ")}{suffix}</b>;
}
```

- [ ] **Step 12: Run all unit tests + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: design tokens, fonts, and UI primitives (Wave 1 Task 2)"
```

---

### Task 3: Prisma init (SQLite dev) + no-secret-columns guard

**Files:**
- Create: `prisma/schema.prisma`, `scripts/guard-no-secret-columns.sh`, `lib/db.ts`, `lib/db.test.ts`
- Modify: `package.json` (add prisma deps + `postinstall`/`db:*` scripts), `.env` (local, git-ignored)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: `prisma` client generated to `@prisma/client`; `lib/db.ts` exports a singleton `prisma`; a `Health` model proving migrations work; `pnpm guard:secrets` script used by CI.

- [ ] **Step 1: Add Prisma dependencies**

Run: `pnpm add -D prisma@6 && pnpm add @prisma/client@6`
Expected: installs, updates lockfile.

- [ ] **Step 2: Create `prisma/schema.prisma`** (SQLite dev; a Health stub model — real models arrive in Wave 2; NO secret columns anywhere, ever)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

/// Stub model to validate migrations in Wave 1. Real domain models land in Wave 2.
/// INVARIANT: no model may ever store a private key, seed phrase, or plaintext password.
model Health {
  id        String   @id @default(cuid())
  note      String
  createdAt DateTime @default(now())
}
```

- [ ] **Step 3: Set local `DATABASE_URL`**

```bash
echo 'DATABASE_URL="file:./prisma/dev.db"' >> .env
```

- [ ] **Step 4: Add scripts to `package.json`**

```json
"db:migrate": "prisma migrate dev",
"db:generate": "prisma generate",
"db:studio": "prisma studio"
```

- [ ] **Step 5: Run the first migration**

Run: `pnpm db:migrate --name init_health`
Expected: creates `prisma/migrations/*/migration.sql` and `prisma/dev.db`; generates the client. **Commit the generated `prisma/migrations/` directory** — CI runs `prisma migrate deploy` against it (it is not git-ignored). This is a local, one-time interactive step; CI never runs `migrate dev`.

- [ ] **Step 6: Create `lib/db.ts` (singleton, server-only)**

```ts
import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

Also install `server-only`: `pnpm add server-only`.

- [ ] **Step 7: Write the failing test `lib/db.test.ts`**

```ts
// @vitest-environment node
// lib/db.ts imports "server-only", which throws under the default jsdom (browser-like)
// env; this per-file pragma runs the DB test in Node, where server-only resolves fine.
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./db";

describe("prisma health model", () => {
  it("creates and reads a Health row", async () => {
    const row = await prisma.health.create({ data: { note: "wave1" } });
    const found = await prisma.health.findUnique({ where: { id: row.id } });
    expect(found?.note).toBe("wave1");
    await prisma.health.delete({ where: { id: row.id } });
  });
  afterAll(async () => { await prisma.$disconnect(); });
});
```

- [ ] **Step 8: Run the DB test to verify it passes**

Run: `pnpm vitest run lib/db.test.ts`
Expected: 1 passed. (If it fails resolving `@prisma/client`, run `pnpm db:generate` and retry.)

- [ ] **Step 9: Create the secret-columns guard `scripts/guard-no-secret-columns.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
# Fails if the Prisma schema introduces a column that could hold a secret.
if grep -inE '(privateKey|seedPhrase|mnemonic|plaintextPassword|passwordPlain|secretKey)' prisma/schema.prisma; then
  echo "ERROR: prisma schema must never store secrets (private keys / seeds / plaintext passwords)." >&2
  exit 1
fi
echo "guard:secrets OK — no secret columns in schema."
```

Run: `chmod +x scripts/guard-no-secret-columns.sh && pnpm guard:secrets`
Expected: prints "guard:secrets OK".

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: prisma init (sqlite) + health model + no-secret-columns guard (Wave 1 Task 3)"
```

---

### Task 4: Port the marketing Home page to React components

**Files:**
- Create: `app/page.tsx` (replaces the Task 1 placeholder), `components/marketing/{GovStrip,SiteHeader,HeroPassport,LiveTicker,Pillars,HoldingsStrip,GovernanceStrip,EmbassiesStrip,Testimonials,FinalCTA,SiteFooter}.tsx`, `lib/hooks/{useReveal,usePassportBook,useGenerativeArt}.ts`, `components/marketing/Reveal.tsx`
- Reference: `Home.html` (repo root) — copy each section's markup + move inline `<script>` logic into hooks. Reuse `Button`, `Card`, `Seal`, `Kicker`, `LiveNumber` from Task 2.

**Interfaces:**
- Consumes: `styles/tokens.css` (Task 2 — the full ported CSS must already include the hero/pillars/holdings/etc. rules), UI primitives (Task 2).
- Produces: a `/` route rendering the full Home page; client hooks `useReveal()` (adds `.in` to `.reveal` on scroll with failsafe), `usePassportBook()` (toggle open), `useGenerativeArt(seed)` (QR + NFT SVG builders — deterministic).

- [ ] **Step 1: Move the interactive JS from `Home.html` into typed hooks**

Create `lib/hooks/useReveal.ts`, `lib/hooks/usePassportBook.ts`, `lib/hooks/useGenerativeArt.ts` as `"use client"` hooks that reproduce, respectively: the IntersectionObserver reveal + 1800ms failsafe; the passport-book open/close toggle (click + Enter/Space); and the deterministic QR + identicon SVG generators (the two IIFEs at the bottom of `Home.html`). Keep the exact seed `20090103` and algorithms so output is identical.

- [ ] **Step 2: Build the section components**

Port each `Home.html` section into its component, class-for-class (the CSS already exists in `tokens.css`):
`GovStrip` (official strip), `SiteHeader` (nav + mobile menu, a `"use client"` island for the burger toggle; links: `/auth`, `/dashboard`, in-page anchors), `HeroPassport` (hero grid + the 3D passport book; uses `usePassportBook` + `useGenerativeArt`), `LiveTicker` (duplicates its track for seamless loop), `Pillars`, `HoldingsStrip`, `GovernanceStrip`, `EmbassiesStrip`, `Testimonials`, `FinalCTA`, `SiteFooter`. Replace the old `Dashboard.html`/`Auth.html`/`Mobile.html` hrefs with Next routes: `Dashboard.html`→`/dashboard`, `Auth.html`→`/auth`. Do **not** carry over the phone→`Mobile.html` redirect script (responsiveness is handled by CSS; a dedicated mobile route is a later decision).

Two smoke-test contracts to preserve exactly: (a) `GovStrip` renders a `<div>` (not `<section>`) and header/footer use `<header>`/`<footer>`, so the page has **exactly 8 `<section>` elements** (hero, why, how, holdings, governance, embassies, voices, cta); (b) `HeroPassport` keeps `id="passportBook"` on the book element and toggles an `open` class on click (both are asserted by the Playwright smoke).

- [ ] **Step 3: Assemble `app/page.tsx`**

`app/page.tsx` renders, in order: `<GovStrip/>`, `<SiteHeader/>`, the eight content sections (`HeroPassport, LiveTicker, Pillars, HoldingsStrip(+how), GovernanceStrip, EmbassiesStrip, Testimonials, FinalCTA`), then `<SiteFooter/>`. (The `(marketing)` route-group layout is deferred until teaser pages exist — Wave 1 has only Home, so the chrome is composed directly in this page.) Create `components/marketing/Reveal.tsx` as a small `"use client"` component that calls `useReveal()` in an effect and renders `null`; include it once near the top of `app/page.tsx` to activate scroll reveals.

- [ ] **Step 4: Manually run the dev server and sanity-check**

Run: `pnpm dev` then load `http://localhost:3000/`
Expected: the Home page renders like `Home.html` — gov strip, nav, hero with the passport book, ticker, pillars, dark holdings block, governance, embassies, CTA, footer.

- [ ] **Step 5: Write the Playwright smoke test `e2e/home.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("home renders all sections with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/");
  await expect(page).toHaveTitle(/CryptRepublic/);
  await expect(page.locator("section")).toHaveCount(8);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/NETWORK STATE/i);
  // count-up settles to the real citizen figure
  await expect(page.getByText("48 392").first()).toBeVisible({ timeout: 4000 });
  // passport book toggles open on click
  const book = page.locator("#passportBook");
  await book.click();
  await expect(book).toHaveClass(/open/);
  expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
});
```

- [ ] **Step 6: Install + configure Playwright**

Run: `pnpm add -D @playwright/test && pnpm exec playwright install --with-deps chromium`
Create `playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  // Run e2e against a PRODUCTION build, not `pnpm dev`: dev mode + React 19 emit
  // hydration/Fast-Refresh console noise that would fail the zero-console-errors assertion.
  webServer: { command: "pnpm build && pnpm start", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 180_000 },
});
```

- [ ] **Step 7: Run the Playwright smoke**

Run: `pnpm e2e`
Expected: 1 passed (home renders, 8 sections, count-up value visible, passport toggles, zero console errors).

- [ ] **Step 8: Run the full gate (typecheck, lint, unit, build)**

Run: `pnpm format && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green; build lists the `/` route.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: port marketing Home to React components with Playwright smoke (Wave 1 Task 4)"
```

---

### Task 5: Foundry workspace + CI (three harnesses green)

**Files:**
- Create: `contracts/` (via `forge init`), `.github/workflows/web.yml`, `.github/workflows/foundry.yml`, `.github/workflows/e2e.yml`, `foundry.toml` (in `contracts/`)
- Modify: `.gitignore` (already covers `contracts/out`, `cache`, `broadcast`)

**Interfaces:**
- Consumes: the web app + tests from Tasks 1–4.
- Produces: a Foundry project with the default `Counter` contract + passing test (proves the contract harness); three GitHub Actions workflows that run web checks, Foundry tests, and the Playwright smoke.

- [ ] **Step 1: Initialize the Foundry workspace**

Run: `mkdir -p contracts && cd contracts && forge init --no-git . && forge test && cd ..`
Expected: `forge init` populates the (empty) `contracts/` dir with `src/Counter.sol`, `test/Counter.t.sol`, and `lib/forge-std`; `forge test` shows passing tests. `--no-git` avoids a nested git repo (the project root already has one); if your Foundry version rejects `--no-git`, use `--no-commit`. If `forge` is not installed: `curl -L https://foundry.paradigm.xyz | bash && foundryup`.

- [ ] **Step 2: Pin Foundry config `contracts/foundry.toml`**

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
optimizer = true
optimizer_runs = 200
solc_version = "0.8.28"

[fmt]
line_length = 100
```

Run: `cd contracts && forge fmt && forge build && cd ..`
Expected: `forge fmt` normalizes the scaffolded `Counter` files to `line_length=100` (so CI's `forge fmt --check` passes); `forge build` compiles clean.

- [ ] **Step 3: Create `.github/workflows/web.yml`**

```yaml
name: web
on: [push, pull_request]
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm guard:secrets
      - run: pnpm format:check
      - run: pnpm db:generate
      - run: pnpm exec prisma migrate deploy
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
    env:
      DATABASE_URL: "file:./prisma/ci.db"
      NEXT_PUBLIC_CHAIN_ENV: testnet
```

- [ ] **Step 4: Create `.github/workflows/foundry.yml`**

```yaml
name: foundry
on: [push, pull_request]
jobs:
  foundry:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: contracts } }
    steps:
      - uses: actions/checkout@v4
        with: { submodules: recursive }
      - uses: foundry-rs/foundry-toolchain@v1
      - run: forge fmt --check
      - run: forge build
      - run: forge test -vvv
```

- [ ] **Step 5: Create `.github/workflows/e2e.yml`**

```yaml
name: e2e
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm exec prisma migrate deploy
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
    env:
      DATABASE_URL: "file:./prisma/ci.db"
      NEXT_PUBLIC_CHAIN_ENV: testnet
```

- [ ] **Step 6: Verify all three harnesses locally**

Run: `pnpm test && (cd contracts && forge test) && pnpm e2e`
Expected: Vitest passes; Foundry `Counter` passes; Playwright home smoke passes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: foundry workspace + CI (web/foundry/e2e) with smoke tests (Wave 1 Task 5)"
```

---

## Wave 1 Acceptance Criteria (from spec §9)

- [ ] `pnpm build` and `pnpm typecheck` succeed; `pnpm lint` and `pnpm format:check` clean.
- [ ] `/` renders pixel-close to `Home.html` on desktop and mobile viewports (Playwright smoke green: 8 sections, count-up value, passport toggle, zero console errors).
- [ ] Design tokens live in `styles/tokens.css` and are documented in this plan; primitives (`Button`, `Card`, `Seal`, `Kicker`, `StatTile`, `LiveNumber`) exist and are used by the Home port.
- [ ] Prisma migrates on SQLite; `lib/db.ts` round-trips a `Health` row; `pnpm guard:secrets` passes (no secret columns).
- [ ] All three CI harnesses (web, foundry, e2e) exist and run a passing smoke test.
- [ ] Chain config switch (`NEXT_PUBLIC_CHAIN_ENV`) is wired into env; no RPC/chainId/address is hardcoded.
- [ ] Each task committed separately with conventional-commit messages.

## Notes for later waves (not built here)

- Wave 2 replaces the `Health` stub with real `User`/`Session`/`SiweNonce`/`CitizenshipApplication`/`CitizenProfile` models and builds auth.
- Wave 3 adds the client-only `lib/wallet/*` (embedded non-custodial wallet) — must never be imported server-side; CSP + `import 'client-only'` boundary added then.
- `lib/config/chain.ts` becomes the real typed registry (RPCs server-side, addresses per network) in Wave 3/4.
- The CR seal is inlined as SVG in `components/ui/Seal.tsx` this wave; the spec's `public/seal/cr-seal.svg` asset (§2.9) is deferred — later waves may extract it if reused widely.
- The `(marketing)` route group + its shared layout are created when the public teaser pages (holdings/governance/embassies/population) are added.
