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
