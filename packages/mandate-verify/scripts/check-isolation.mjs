/**
 * The constraint that makes this package worth anything: it can read the chain
 * and nothing else.
 *
 * A verifier that imported the application would be checking our arithmetic
 * against our arithmetic. So the rule is enforced here rather than promised in
 * a README — every import in `src/` must be viem, a node builtin, or a sibling
 * file in this package. Anything else fails the build.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");

/** The only third-party code allowed to reach the verification path. */
const ALLOWED = new Set(["viem", "viem/chains", "viem/utils", "viem/accounts"]);

/**
 * Test files may reach the test runner, and nothing else.
 *
 * Without this the package could not be tested at all, which is worse than the
 * risk it avoids: the verdict logic — the branch that decides whether a
 * mandate FAILED or was simply never awarded — is the part of this package
 * most worth testing and the part a reviewer is least able to check by eye.
 * Every other rule still applies to test files: they may not import the
 * application, touch the filesystem, read the operator's environment, or name
 * a host off the allowlist. Only the shipped `dependencies` are counted, so a
 * dev-only runner cannot creep into the verification path.
 */
const TEST_ONLY = new Set(["vitest"]);
const isTest = (p) => /\.test\.ts$/.test(p);

/**
 * A test may name loopback, because a test starts the node it talks to.
 *
 * The host rule exists so the shipped verification path cannot be pointed at
 * somewhere that would answer with whatever the operator wanted it to hear. A
 * server the test process itself creates and closes is not that; it is how the
 * verdict logic gets exercised without the network. Shipped files are still
 * held to the allowlist exactly as before.
 */
const TEST_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Hosts this package may talk to: public BSC RPC endpoints, and nothing else.
 *
 * An explicit list rather than a prefix pattern. The pattern version allowed
 * anything beginning "bsc-" and rejected "bsc.rpc.blxrbdn.com", which is both
 * too loose and too tight — it would have waved through a lookalike domain
 * while blocking a real node.
 */
const ALLOWED_HOSTS = new Set([
  "bsc.drpc.org",
  "bsc.rpc.blxrbdn.com",
  "bsc-dataseed1.binance.org",
  "bsc.blockrazor.xyz",
  "bsc-rpc.publicnode.com",
  "bsc-testnet-rpc.publicnode.com",
  "bsc-testnet.public.blastapi.io",
  "bscscan.com",
  "www.npmjs.com",
  "github.com",
]);
const HOST_RE = /https?:\/\/([a-z0-9.-]+)/gi;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) files.push(p);
  }
})(srcDir);

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
const DYNAMIC = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

/**
 * Comments, blanked for the import scan only.
 *
 * The import pattern spans newlines to catch multi-line import statements,
 * which means an `import` anywhere above a quoted phrase in prose matches the
 * two together — a comment containing the words *from "the comparison came out
 * wrong"* was read as a dependency by that name. An import cannot occur inside
 * a comment, so removing them costs the check nothing.
 *
 * The environment, filesystem and host scans still read comments. A URL in a
 * comment is not a network call, but the whole point of the host rule is that
 * naming an endpoint is a deliberate act, and it stays deliberate here.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, "");

const violations = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const code = stripComments(source);
  const rel = file.slice(root.length + 1);
  for (const re of [IMPORT, DYNAMIC, REQUIRE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code))) {
      const spec = m[1];
      if (spec.startsWith(".")) {
        // Relative imports may not climb out of this package.
        const target = resolve(dirname(file), spec);
        if (!target.startsWith(srcDir)) violations.push(`${rel}: reaches outside the package — "${spec}"`);
        continue;
      }
      if (BUILTINS.has(spec) || ALLOWED.has(spec)) continue;
      if (isTest(file) && TEST_ONLY.has(spec)) continue;
      violations.push(`${rel}: imports "${spec}", which is neither viem nor a node builtin`);
    }
  }
  // Reading the operator's world by any other route is equally disqualifying.
  for (const [pattern, why] of [
    [/process\.env\.(?!NO_COLOR\b)[A-Z_]+/g, "reads an environment variable the operator controls"],
    [/\bfs\.|readFileSync|writeFileSync/g, "touches the filesystem"],
    [HOST_RE, "contacts a host that is not on the public-BSC-node allowlist"],
  ]) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(source))) {
      // Host checks compare the captured hostname against the allowlist;
      // everything else is a violation on sight.
      if (pattern === HOST_RE) {
        const host = (m[1] ?? "").toLowerCase();
        if (ALLOWED_HOSTS.has(host)) continue;
        if (isTest(file) && TEST_HOSTS.has(host)) continue;
        violations.push(`${rel}: ${why} — "${host}"`);
        continue;
      }
      violations.push(`${rel}: ${why} — "${m[0]}"`);
    }
  }
}

const deps = Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies ?? {});
for (const d of deps) if (d !== "viem") violations.push(`package.json: depends on "${d}"; only viem is permitted`);

if (violations.length) {
  console.error("\n  isolation broken — this package must read nothing but the chain:\n");
  for (const v of violations) console.error(`    ✗ ${v}`);
  console.error("");
  process.exit(1);
}

const tests = files.filter(isTest).length;
console.log(
  `  ✓ isolated: ${files.length - tests} files + ${tests} tests, ${deps.length} dependency (viem), ` +
    `no filesystem, no environment, no operator host`,
);
