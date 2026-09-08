import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests run against the workspace source, not a build artifact.
 *
 * Every package ships TypeScript, so there is one source of truth per module
 * and no build step between an edit and a test. The aliases mirror what the
 * workspace symlinks already provide, so a test and the app resolve the same
 * file.
 */
const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@bench/measure": p("./packages/measure/src/index.ts"),
      "@bench/shared": p("./packages/shared/src/index.ts"),
      "@bench/index": p("./packages/index/src/index.ts"),
      "@bench/probe": p("./packages/probe/src/index.ts"),
      "@bench/metrics": p("./packages/metrics/src/index.ts"),
      "@bench/rails": p("./packages/rails/src/index.ts"),
      "@bench/agents": p("./apps/agents/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "worker/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    environment: "node",
  },
});
