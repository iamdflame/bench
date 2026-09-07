import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The home directory above this project is itself a git repo with its own
  // lockfile; without this, Next infers the wrong workspace root.
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "api.8004scan.io" }],
  },
  /**
   * Left as runtime requires rather than bundled.
   *
   * `@bnbagent/sdk` loads `@altananetwork/sdk` through a dynamic require — it
   * is an optional peer dependency, GPL-3.0, so the SDK does not hard-depend
   * on it. Webpack cannot follow that, so the bundled server reported the
   * package "not installed" while it sat in node_modules, and revocation
   * failed in production while working perfectly from the CLI. The Greenfield
   * SDK has the same shape.
   */
  /**
   * Names people type, and names we used to use.
   *
   * The nav labels /assay as "Method", so a visitor who types /method — or
   * follows an older link — hit a 404 on a site whose case is that its method
   * is the product. A dead end is worse than a redirect.
   */
  async redirects() {
    return [
      // The rebuild moved every room. Old links, bookmarks and preview cards
      // must land somewhere real, not on a 404 — a dead end is worse than a
      // redirect on a site whose whole case is that its claims are checkable.
      { source: "/agent/:tokenId", destination: "/agent/56/:tokenId", permanent: false },
      { source: "/agents", destination: "/registry", permanent: false },
      { source: "/offices", destination: "/", permanent: false },
      { source: "/office/rebalancing", destination: "/hire/rebalancing", permanent: false },
      { source: "/office/grid-trading", destination: "/hire/grid", permanent: false },
      { source: "/office/yield-optimisation", destination: "/hire/yield", permanent: false },
      { source: "/office/health-factor", destination: "/hire/health", permanent: false },
      { source: "/market", destination: "/hire/health", permanent: false },
      { source: "/floor", destination: "/dashboard", permanent: false },
      { source: "/bench", destination: "/registry", permanent: false },
      { source: "/compare", destination: "/hire/health", permanent: false },
      { source: "/authority", destination: "/dashboard", permanent: false },
      { source: "/start", destination: "/", permanent: false },
      { source: "/assay", destination: "/method", permanent: false },
      { source: "/evidence", destination: "/method", permanent: false },
      { source: "/list-your-agent", destination: "/registry", permanent: false },
      { source: "/mandate/:id", destination: "/settlement/:id", permanent: false },
      { source: "/ledger/:deployment/:id", destination: "/settlement/:id", permanent: false },
    ];
  },
  serverExternalPackages: [
    "@bnbagent/sdk",
    "@altananetwork/sdk",
    "@bnb-chain/greenfield-js-sdk",
  ],
};

export default config;
