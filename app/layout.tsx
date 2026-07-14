import type { Metadata } from "next";
import { Archivo, Cinzel, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

// The classical flared display face (Greek-inscription energy) for the
// marketing poster surfaces — Trajan-adjacent, engraved like the crest.
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-cinzel",
  display: "swap",
});

/**
 * Force dynamic rendering app-wide so the per-request CSP nonce (set in
 * middleware.ts) is applied to Next's inline bootstrap/RSC scripts. Statically
 * prerendered HTML bakes those inline scripts at build time with NO nonce, which
 * the strict `script-src 'self' 'nonce-…'` (no `unsafe-inline`) would block. The
 * tradeoff — losing full static prerender — is the accepted cost of a strict,
 * nonce-based CSP that safely hosts the wallet.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CryptRepublic — The World's First Network State",
  description: "Become a citizen of a sovereign collective without territory.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable} ${cinzel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
