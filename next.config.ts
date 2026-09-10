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
  /**
   * The old shopfront, pointed at the new one.
   *
   * The rebuild moved the marketplace, the tape and the ticket to routes that
   * say what they are. These URLs are in a submitted form, in a README and in
   * whatever anybody bookmarked, and a 404 on one of them is a dead end of
   * exactly the kind this rebuild exists to remove — so every one of them is
   * still a live link to the thing it used to be.
   */
  async redirects() {
    return [
      { source: "/method", destination: "/assay", permanent: false },
      { source: "/agent/:tokenId", destination: "/agents/:tokenId", permanent: false },
      { source: "/market", destination: "/agents", permanent: false },
      { source: "/floor", destination: "/activity", permanent: false },
      { source: "/start", destination: "/agents", permanent: false },
      /*
        The four office pages were a second, thinner copy of the catalog and
        they 404 today. One list, filtered, is the honest shape: a category
        page that shows fewer agents than the tile promises is the diversity
        failure this rebuild set out to remove.
      */
      { source: "/office/:category", destination: "/agents?category=:category", permanent: false },
      { source: "/offices", destination: "/agents", permanent: false },
    ];
  },
  serverExternalPackages: [
    "@bnbagent/sdk",
    "@altananetwork/sdk",
    "@bnb-chain/greenfield-js-sdk",
  ],
};

export default config;
