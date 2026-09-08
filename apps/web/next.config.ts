import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { NextConfig } from "next";

/*
  Load the repository-root environment before anything reads it.

  Next reads `.env` from the app directory, and in a workspace the keys, the
  RPC list and the payout addresses belong to the repository rather than to one
  app — the worker and the scripts need the same values. Without this the site
  starts with an empty `payTo` and serves a payment challenge nobody can pay,
  which our own prober then correctly refuses to list. Silent and confusing, so
  it is loaded here rather than duplicated per app.

  Existing variables always win, so a platform's own configuration is never
  overwritten by a file that happens to be present in a checkout.
*/
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../");
for (const file of [".env", ".env.local"]) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key] !== undefined) continue;
    let value = m[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/**
 * Workspace packages ship TypeScript source rather than a build artifact, so
 * Next compiles them itself. That keeps one source of truth per module and
 * removes a build step that would otherwise sit between an edit and seeing it.
 */
const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  /*
    Every workspace package the app imports, listed here and declared as a
    dependency of `@bench/web`.

    Both are load-bearing and only one of them fails locally. npm workspaces
    hoist the sibling packages, so an undeclared import resolves fine on this
    machine and dies on Vercel with "Can't resolve @bench/…" — which is how
    `@bench/counterfactual` reached production and stopped the build.
  */
  transpilePackages: [
    "@bench/shared",
    "@bench/measure",
    "@bench/index",
    "@bench/probe",
    "@bench/metrics",
    "@bench/rails",
    "@bench/counterfactual",
  ],
  /**
   * Left as runtime requires rather than bundled.
   *
   * `@bnbagent/sdk` reaches `@altananetwork/sdk` through a dynamic require —
   * it is an optional peer dependency, so the SDK does not hard-depend on it.
   * A bundler cannot follow that, and the symptom is a server reporting the
   * package "not installed" while it sits in node_modules.
   */
  serverExternalPackages: ["@bnbagent/sdk", "@altananetwork/sdk"],
};

export default config;
