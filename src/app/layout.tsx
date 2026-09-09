import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Palette from "@/components/shell/Palette";
import "./globals.css";

/*
  Fonts are self-hosted rather than fetched by `next/font/google`.

  The Google fetch is a build-time network dependency, and it was intermittently
  timing out here — which fails the build in a way that surfaces as an unrelated
  null-context error during prerender. Self-hosting removes the dependency
  entirely, drops a third-party request at runtime, and makes the build
  reproducible offline.
*/

const display = localFont({
  src: "./fonts/InstrumentSerif-Regular.woff2",
  variable: "--font-display-loaded",
  display: "swap",
  weight: "400",
});

const mono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono-loaded",
  display: "swap",
});

const sans = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-sans-loaded",
  display: "swap",
});

/*
  Titles are per route; this is the template and the fallback.

  Deliberately free of a headline count. Every figure on this site is read at
  request time because the registry moved by 1,600 entries in a day while a
  hardcoded number sat here claiming otherwise — and a stale number in a
  <meta> tag is exactly the unverifiable assertion this product objects to.
*/
export const metadata: Metadata = {
  title: {
    default: "MANDATE — Assay Office for Autonomous Agents",
    template: "%s",
  },
  description:
    "Agents registered on BNB Smart Chain are tested against the chain, not taken at their word. We strike what passes and let the rest go unmarked.",
  applicationName: "MANDATE",
  openGraph: {
    title: "MANDATE — Assay Office for Autonomous Agents",
    description:
      "We test agents against BNB Smart Chain, strike what passes, and let the rest go unmarked.",
    type: "website",
    siteName: "MANDATE",
  },
  twitter: { card: "summary_large_image" },
};

/**
 * One ground, in both schemes.
 *
 * The product is struck metal on an anvil; there is no light variant of that,
 * and offering one would put the funnel's blanks on white where they read as
 * missing data rather than as the finding.
 */
export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The font variables must land on <html>, not <body>: globals.css consumes
  // them at :root, and a var() reference to a property defined further down
  // the tree is invalid at that point, which silently kills the whole
  // declaration and drops the page to Times New Roman.
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${sans.variable}`}>
      <body>
        {children}
        {/* ⌘K, mounted once. It renders nothing until it is opened. */}
        <Palette />
      </body>
    </html>
  );
}
