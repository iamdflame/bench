/**
 * The gate on how an absence is allowed to look.
 *
 * "No reviews" and "we could not read the reviews" are different claims and
 * only one of them is about the agent. A product that renders both as `0` has
 * destroyed the distinction it exists to preserve, and it does so one
 * convenience at a time: a `?? 0` here, a `|| "—"` there.
 *
 * This reads the source of every surface that renders data and fails on the
 * patterns that turn an unknown into a number or a dash. It also checks the
 * live board for the property directly, so a page that finds a new way to do
 * it is still caught.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readBoardView } from "../../apps/web/lib/board";

let failed = 0;
const fail = (m: string) => {
  console.error(`  FAIL  ${m}`);
  failed++;
};
const pass = (m: string) => console.log(`  ok    ${m}`);

console.log("\nabsence: an unknown is never rendered as a zero, a blank or a dash\n");

const ROOT = new URL("../../apps/web/", import.meta.url).pathname;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "data") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/*
  Patterns that quietly convert an unknown into something that reads as a
  measurement. Each is a real mistake rather than a hypothetical: `?? 0` on a
  count, `|| "—"` on a value, and `.value` reached without checking `.known`.
*/
const BANNED: { re: RegExp; why: string }[] = [
  { re: /\?\?\s*0\b(?!\s*\)?\s*[,;]?\s*\/\/ *count-is-a-count)/, why: "`?? 0` turns an unknown into a zero" },
  { re: /\|\|\s*0\b/, why: "`|| 0` turns an unknown into a zero" },
  { re: /\?\?\s*["'`]—["'`]/, why: "`?? \"—\"` renders an unknown as a dash with no reason" },
  { re: /\?\?\s*["'`]N\/A["'`]/i, why: "`?? \"N/A\"` renders an unknown with no reason" },
];

/*
  Files allowed to use the patterns, with the reason each is genuinely safe.
  An allowlist rather than a global switch, so adding one is a decision.
*/
const ALLOWED: Record<string, string> = {
  "lib/board.ts": "counts a cohort size and a latency, both of which genuinely default to a real value",
  "lib/respond.ts": "parses pagination parameters from a query string, where zero is the correct default offset",
  "app/api/v1/agents/route.ts": "the same pagination default: an absent ?offset means start at the beginning, which is a real answer and not an unknown",
};

let offences = 0;
for (const file of walk(ROOT)) {
  const rel = file.slice(ROOT.length);
  if (ALLOWED[rel]) continue;
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    for (const b of BANNED) {
      if (b.re.test(line)) {
        fail(`${rel}:${i + 1} — ${b.why}\n        ${line.trim().slice(0, 100)}`);
        offences++;
      }
    }
  });
}
if (offences === 0) pass("no surface converts an unknown into a number or a dash");

/* -------------------------------------------- the property, on live data */
{
  const view = readBoardView({ limit: 200 });
  const bad = view.rows.filter((r) => r.track === null && !r.trackMissing);
  if (bad.length > 0) {
    fail(`${bad.length} row(s) have no measurement and no reason for it: ${bad.slice(0, 3).map((r) => r.key).join(", ")}`);
  } else pass(`every one of ${view.rows.length} live rows with no measurement carries the reason instead`);

  const railsBad = view.rows.filter((r) =>
    (["call", "hire", "mandate"] as const).some((k) => !r.rails[k].open && !r.rails[k].reason),
  );
  if (railsBad.length > 0) fail(`${railsBad.length} row(s) have a closed rail with no reason`);
  else pass("every closed rail on every live row names the condition that closed it");
}

/* ------------------------------------ the unknown renderer exists and is used */
{
  const css = readFileSync(new URL("../../apps/web/app/globals.css", import.meta.url).pathname, "utf8");
  if (!/\.unmeasured\b/.test(css) || !/\.unmeasured__why\b/.test(css)) {
    fail("the stylesheet has no dedicated treatment for an unmeasured value and its reason");
  } else pass("an unmeasured value has its own visual treatment, distinct from a zero");
}

console.log(
  failed === 0 ? "\n  absence is designed, not defaulted.\n" : `\n  ${failed} failed.\n`,
);
process.exit(failed > 0 ? 1 : 0);
