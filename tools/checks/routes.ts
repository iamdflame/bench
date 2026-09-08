/**
 * The gate on links that do not go anywhere.
 *
 * The last build shipped a README documenting four routes that 404'd on the
 * deployed site, and a site table listing rooms that had been deleted. It is
 * the cheapest possible way to lose a reader's trust and the easiest to
 * prevent, because a link is checkable.
 *
 * This resolves every internal link in the README and in every page against
 * the route tree that actually exists, and fails on any that cannot be served.
 * It runs without a server: the App Router's structure is a directory tree, so
 * the answer is on disk.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

let failed = 0;
const fail = (m: string) => {
  console.error(`  FAIL  ${m}`);
  failed++;
};
const pass = (m: string) => console.log(`  ok    ${m}`);

console.log("\nroutes: every internal link resolves against the route tree\n");

const APP = new URL("../../apps/web/app/", import.meta.url).pathname;

/** Every route the App Router will serve, as a matchable pattern. */
function routes(dir = APP, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (!statSync(p).isDirectory()) continue;
    // Route groups and private folders do not appear in the URL.
    const seg = entry.startsWith("(") ? "" : entry.startsWith("_") ? null : `/${entry}`;
    if (seg === null) continue;
    const next = prefix + seg;
    if (existsSync(join(p, "page.tsx")) || existsSync(join(p, "route.ts"))) out.push(next || "/");
    out.push(...routes(p, next));
  }
  return out;
}

const ROUTES = [...(existsSync(join(APP, "page.tsx")) ? ["/"] : []), ...routes()];

/** Turn `/j/[job]` into a matcher, and `/a/[chain]/[id]` into a two-slot one. */
function matches(path: string): boolean {
  const clean = path.split("#")[0]!.split("?")[0]!.replace(/\/$/, "") || "/";
  return ROUTES.some((r) => {
    const rp = r.split("/").filter(Boolean);
    const cp = clean.split("/").filter(Boolean);
    if (rp.length !== cp.length) return false;
    return rp.every((seg, i) => (seg.startsWith("[") ? true : seg === cp[i]));
  });
}

/**
 * Does some route continue from here?
 *
 * Used for a link whose remaining segments are interpolated. It is a weaker
 * assertion than a full match and it is the strongest one available without
 * evaluating the template, which is the right trade: it still catches
 * `/offices/` and `/floor/`, which is what this gate is for.
 */
function prefixes(path: string): boolean {
  const cp = path.split("/").filter(Boolean);
  return ROUTES.some((r) => {
    const rp = r.split("/").filter(Boolean);
    return rp.length > cp.length && cp.every((seg, i) => rp[i] === seg || rp[i]!.startsWith("["));
  });
}

console.log(`  route tree: ${ROUTES.sort().join("  ")}\n`);

/* ---------------------------------------------- 1. links inside the pages */
{
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  };
  const files = [...walk(APP), ...walk(new URL("../../apps/web/components/", import.meta.url).pathname)];

  const bad: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    /*
      href="/..." on a Link or an anchor.

      A template literal is checked by its static prefix, which is where a
      wrong route actually shows up. A prefix ending in "/" is a path whose
      remaining segments are interpolated — `/hire/${chain}/${id}` reaches here
      as `/hire/` — so it is matched as a prefix of some longer route rather
      than as a complete path.
    */
    for (const m of src.matchAll(/href=(?:"|\{`)(\/[^"`${\s]*)/g)) {
      const raw = m[1]!;
      if (raw.startsWith("//")) continue;
      const okay = raw.endsWith("/") && raw !== "/" ? prefixes(raw) : matches(raw);
      if (!okay) bad.push(`${f.replace(/^.*apps\/web\//, "")} → ${raw}`);
    }
  }
  if (bad.length > 0) {
    for (const b of new Set(bad)) fail(`a page links to a route that does not exist: ${b}`);
  } else pass("every internal link in every page and component resolves");
}

/* ------------------------------------------------- 2. links inside the README */
{
  const readme = new URL("../../README.md", import.meta.url).pathname;
  if (!existsSync(readme)) {
    fail("there is no README to check");
  } else {
    const src = readFileSync(readme, "utf8");
    const bad: string[] = [];
    // Markdown links to site paths, and bare paths in the routes table.
    for (const m of src.matchAll(/\]\((\/[^)\s]*)\)/g)) {
      if (!matches(m[1]!)) bad.push(m[1]!);
    }
    for (const m of src.matchAll(/^\|\s*`(\/[^`]*)`/gm)) {
      const path = m[1]!.replace(/\[.*?\]/g, "x");
      if (!matches(path)) bad.push(m[1]!);
    }
    if (bad.length > 0) {
      for (const b of new Set(bad)) fail(`the README documents a route that does not exist: ${b}`);
    } else pass("every site path the README names is a route this app serves");
  }
}

/* ------------------------------------ 3. the routes the plan committed to exist */
{
  const REQUIRED = ["/", "/j/[job]", "/a/[chain]/[id]", "/hire/[chain]/[id]", "/desk", "/register", "/data", "/list"];
  const missing = REQUIRED.filter((r) => !ROUTES.includes(r));
  if (missing.length > 0) fail(`these routes are specified and missing: ${missing.join(", ")}`);
  else pass(`all ${REQUIRED.length} specified routes exist`);
}

/* ---------------------------- 4. no route exists that the plan did not ask for */
{
  const ALLOWED = new Set([
    "/", "/j", "/j/[job]", "/a", "/a/[chain]", "/a/[chain]/[id]",
    "/hire", "/hire/[chain]", "/hire/[chain]/[id]",
    "/desk", "/register", "/data", "/list",
    // §11's machine surfaces. `/api/a2a` is named there alongside `/api/mcp`.
    "/api", "/api/mcp", "/api/a2a", "/api/rails", "/api/rails/call", "/api/rails/hire", "/api/rails/mandate",
    /*
      The second half of a buyer-funded Rail 1 call. It is not a ninth room: the
      signature is made in the browser and the seller's host carries no CORS
      headers for us, so delivering it has to happen server-side. One route,
      because the alternative is a page that cannot pay from the visitor's own
      wallet at all.
    */
    "/api/rails/call/settle",
    "/api/agents", "/api/agents/[slug]",
    // The marketplace's own ERC-8004 card, at the conventional place.
    "/.well-known", "/.well-known/agent-card.json",
    "/api/v1", "/api/v1/agents", "/api/v1/agents/[chain]", "/api/v1/agents/[chain]/[id]",
    "/api/v1/snapshot", "/api/v1/jobs", "/api/v1/jobs/[job]", "/api/v1/check",
  ]);
  const extra = ROUTES.filter((r) => !ALLOWED.has(r));
  if (extra.length > 0) {
    fail(`routes exist that the information architecture does not name: ${extra.join(", ")}. Eight rooms, not fourteen.`);
  } else pass("no route has crept in beyond the eight rooms and the machine surfaces");
}

console.log(failed === 0 ? "\n  nothing links to a dead end.\n" : `\n  ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
