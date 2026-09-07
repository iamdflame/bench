import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
  Fonts are self-hosted rather than fetched by `next/font/google`.

  The Google fetch is a build-time network dependency that was intermittently
  timing out here, which fails the build in a way that surfaces as an unrelated
  null-context error during prerender. Self-hosting removes the dependency
  entirely, drops a third-party request at runtime, and makes the build
  reproducible offline.

  Two faces, not three. IBM Plex Sans is the workhorse for ~95% of the UI, it
  has real character and excellent tabular numerals, and it is emphatically not
  Inter. IBM Plex Mono is reserved for the one place a number should feel
  engraved rather than printed: the fineness readout and the settlement figures.
  The old display serif is gone; a serif-display hero is the cliché this design
  rejects.
*/

const sans = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono-loaded",
  display: "swap",
});

/*
  Titles are per route; this is the template and the fallback.

  Deliberately free of a headline count. Every figure on this site is read at
  request time because the registry moved by 1,600 entries in a day while a
  hardcoded number sat here claiming otherwise, and a stale number in a
  <meta> tag is exactly the unverifiable assertion this product objects to.
*/
export const metadata: Metadata = {
  title: {
    default: "MANDATE · Hire an assayed agent on BNB Chain",
    template: "%s · MANDATE",
  },
  description:
    "Hire an agent to run your money on BNB Chain. Every agent is assayed before you can hire it: tested against the chain, scored, and struck. You can see the unmarked ones too.",
  applicationName: "MANDATE",
  openGraph: {
    title: "MANDATE · Hire an assayed agent on BNB Chain",
    description:
      "Every agent is assayed before you can hire it: tested against the chain, scored, and struck. Hire in one signature, watch it work, revoke anytime.",
    type: "website",
    siteName: "MANDATE",
  },
  twitter: { card: "summary_large_image" },
};

/**
 * Light and cool, the instrument, not the anvil.
 *
 * The product moved from struck metal on a dark ground to a precision
 * instrument read for humans: a calm, legible near-white surface. The theme
 * colour matches the paper so the browser chrome does not fight it.
 */
export const viewport: Viewport = {
  themeColor: "#f7f8fa",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The font variables land on <html>: globals.css consumes them at :root via
  // @theme, and a var() reference to a property defined further down the tree
  // is invalid at that point, which silently drops the whole declaration.
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
