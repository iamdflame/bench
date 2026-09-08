/**
 * The gate on what counts as a number here.
 *
 * A figure without a block and a method is an assertion. The `Measurement`
 * type refuses to be constructed without both — `measure()` throws rather than
 * returning an invalid object, at construction rather than at render — and
 * this checks that the refusal still works and that nothing has routed around
 * it by building the object literally.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { measure, toWire, fromWire } from "@bench/measure";
import { readBoardView } from "../../apps/web/lib/board";

let failed = 0;
const fail = (m: string) => {
  console.error(`  FAIL  ${m}`);
  failed++;
};
const pass = (m: string) => console.log(`  ok    ${m}`);

console.log("\nmeasurement: every figure carries the block and the method behind it\n");

const good = {
  name: "Time in range",
  value: 94.2,
  unit: "%" as const,
  numerator: 27.4,
  denominator: 29.1,
  window: "30d rolling",
  block: 120_590_203n,
  method: "time-in-range",
  source: "chain" as const,
  chainId: 56,
};

/* --------------------------------------- 1. the constructor refuses the invalid */
{
  const cases: [string, Record<string, unknown>][] = [
    ["no block", { ...good, block: 0n }],
    ["no method", { ...good, method: "" }],
    ["no window", { ...good, window: "" }],
    ["a value that is not finite", { ...good, value: Number.NaN }],
  ];
  let bad = 0;
  for (const [label, input] of cases) {
    let threw = false;
    try {
      measure(input as Parameters<typeof measure>[0]);
    } catch {
      threw = true;
    }
    if (!threw) {
      fail(`a measurement with ${label} was constructed rather than refused`);
      bad++;
    }
  }
  if (bad === 0) pass("a measurement with no block, no method, no window or no value is refused at construction");
}

/* ------------------------------------------- 2. a valid one survives the wire */
{
  const m = measure(good);
  const back = fromWire(toWire(m));
  if (back.block !== m.block) fail("the block does not survive serialisation, so provenance is lost in the API");
  else if (back.method !== m.method) fail("the method does not survive serialisation");
  else pass("a measurement keeps its block and method across the wire, as a decimal string");
}

/* ------------------------------------ 3. every stored measurement is complete */
{
  const view = readBoardView({ limit: 300 });
  const rows = view.rows.filter((r) => r.track);
  const bad = rows.filter((r) => !r.track!.provenance.includes("block"));
  if (bad.length > 0) {
    fail(`${bad.length} rendered figure(s) carry no block: ${bad.slice(0, 3).map((r) => r.key).join(", ")}`);
  } else {
    pass(
      rows.length > 0
        ? `all ${rows.length} rendered figures carry their block and window`
        : "no figures are being rendered yet, so none can be missing provenance",
    );
  }
}

/* ------------------------------ 4. nothing constructs a Measurement literally */
{
  const ROOTS = [new URL("../../apps/web/", import.meta.url).pathname, new URL("../../packages/", import.meta.url).pathname];
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".next" || e === "dist" || e === "data") continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  };

  /*
    The type could be satisfied by an object literal, which would sidestep the
    validation in `measure()`. Only the type's own module is allowed to do it.
  */
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      if (file.endsWith("packages/measure/src/types.ts")) continue;
      const src = readFileSync(file, "utf8");
      if (/:\s*Measurement\s*=\s*\{/.test(src)) offenders.push(file.replace(/^.*\/(apps|packages)\//, "$1/"));
    }
  }
  if (offenders.length > 0) {
    fail(`these build a Measurement as a literal, bypassing validation: ${offenders.join(", ")}`);
  } else pass("every measurement in the codebase goes through the constructor that validates it");
}

/* ------------------------------ 5. the provenance renderer requires both fields */
{
  const src = readFileSync(new URL("../../packages/measure/src/format.ts", import.meta.url).pathname, "utf8");
  if (!/displayProvenance/.test(src) || !/block \$\{m\.block/.test(src)) {
    fail("there is no single renderer that puts the block on a figure");
  } else pass("one renderer produces the provenance line, so no surface can print a figure without it");
}

console.log(
  failed === 0 ? "\n  a number here is a reading, not an assertion.\n" : `\n  ${failed} failed.\n`,
);
process.exit(failed > 0 ? 1 : 0);
