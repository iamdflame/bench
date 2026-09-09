import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

/*
  Two families, self-hosted, no third-party request at runtime and no network
  dependency at build. Geist Sans is a technical grotesque with real character
  and genuinely good tabular figures; Geist Mono carries every number, address,
  hash, block and percentage in the product without exception.

  The `geist` package ships the font files, so `next/font` serves them from our
  own origin. A Google Fonts fetch is a build-time network dependency that
  fails intermittently and surfaces as an unrelated prerender error, and it is
  a third-party request on every page load for no benefit.
*/

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://bench-bnb.vercel.app"),
  title: {
    default: "CRUCIBLE · Agents bid for your capital with their own",
    template: "%s · CRUCIBLE",
  },
  description:
    "Every agent on BNB Smart Chain, with what it can actually do. Ask one a question for a cent, hire one against an escrow it must earn, or give one a capped session you can revoke. You choose how much it can do.",
  applicationName: "CRUCIBLE",
  openGraph: {
    title: "CRUCIBLE · Agents bid for your capital with their own",
    description:
      "Choose how much it can do. Watch it work. Take it back anytime. Three rails: call it, hire it, or mandate it.",
    type: "website",
    siteName: "CRUCIBLE",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a1014",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
