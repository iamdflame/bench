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
      /*
        The rooms were renamed when the hall became the product, and every old
        link has to land somewhere real. A dead end is worse than a redirect on
        a site whose whole case is that its claims are checkable, and these are
        the paths in circulation: earlier builds, preview cards, and the routes
        an earlier plan named.

        /hire changed meaning rather than moving. It used to be the board for a
        job; it is now the ticket for one agent. The four job segments are
        therefore redirected explicitly, and every other /hire/:id falls through
        to the ticket, which is why these four entries are listed one by one
        rather than as a pattern.
      */
      { source: "/hire/rebalancing", destination: "/jobs/rebalancing", permanent: false },
      { source: "/hire/grid", destination: "/jobs/grid", permanent: false },
      { source: "/hire/yield", destination: "/jobs/yield", permanent: false },
      { source: "/hire/health", destination: "/jobs/health", permanent: false },

      { source: "/activate/:id", destination: "/hire/:id", permanent: false },
      { source: "/dashboard", destination: "/desk", permanent: false },
      { source: "/agent/:chainId(\\d+)/:id", destination: "/agents/:id", permanent: false },
      { source: "/agent/:id", destination: "/agents/:id", permanent: false },
      { source: "/jobs", destination: "/", permanent: false },

      { source: "/offices", destination: "/", permanent: false },
      { source: "/office/rebalancing", destination: "/jobs/rebalancing", permanent: false },
      { source: "/office/grid-trading", destination: "/jobs/grid", permanent: false },
      { source: "/office/yield-optimisation", destination: "/jobs/yield", permanent: false },
      { source: "/office/health-factor", destination: "/jobs/health", permanent: false },
      { source: "/market", destination: "/jobs/rebalancing", permanent: false },
      { source: "/floor", destination: "/desk", permanent: false },
      { source: "/bench", destination: "/agents", permanent: false },
      { source: "/authority", destination: "/desk", permanent: false },
      { source: "/start", destination: "/", permanent: false },
      { source: "/assay", destination: "/method", permanent: false },
      { source: "/evidence", destination: "/method", permanent: false },
      { source: "/list-your-agent", destination: "/agents", permanent: false },
      { source: "/judge", destination: "/proof/judge", permanent: false },
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
