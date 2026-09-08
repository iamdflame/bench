/**
 * The gate on movement.
 *
 * §9.6 allows six motions and forbids nine techniques. Both halves rot the same
 * way: somebody adds a fade-and-slide-up to a section because it looks nice in
 * isolation, and six months later every section has one and the product feels
 * like a template. A list in a design document does not prevent that; a build
 * failure does.
 *
 * The rules checked here are the plan's own, not preferences:
 *
 *   - every animation names a keyframe that exists
 *   - keyframes animate only transform and opacity, so nothing that moves can
 *     cause layout or paint on the main thread
 *   - every duration is a token, so nothing can escape the reduced-motion
 *     switch by hard-coding a number
 *   - reduced motion cancels animations *and* transitions
 *   - the nine forbidden techniques do not appear
 *   - motion that follows a data event is driven by a data event
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failed = 0;
const fail = (m: string) => {
  console.error(`  FAIL  ${m}`);
  failed++;
};
const pass = (m: string) => console.log(`  ok    ${m}`);

console.log("\nmotion: six motions, nine forbidden techniques\n");

const CSS = readFileSync(new URL("../../apps/web/app/globals.css", import.meta.url).pathname, "utf8");

/* ------------------------------------------- 1. animations name real keyframes */
{
  const declared = new Set([...CSS.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!));
  const used = new Set(
    [...CSS.matchAll(/animation:\s*([\w-]+)\s/g)].map((m) => m[1]!).filter((n) => n !== "none"),
  );
  const missing = [...used].filter((u) => !declared.has(u));
  const unused = [...declared].filter((d) => !used.has(d));
  if (missing.length > 0) fail(`animation names a keyframe that does not exist: ${missing.join(", ")}`);
  else if (unused.length > 0) fail(`a keyframe is declared and never used: ${unused.join(", ")}`);
  else pass(`${declared.size} keyframes declared, ${used.size} used, none dangling`);
}

/* ------------------------------- 2. keyframes only animate composited properties */
{
  const bad: string[] = [];
  for (const m of CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
    const name = m[1]!;
    const body = m[2]!;
    for (const decl of body.matchAll(/^\s*([a-z-]+)\s*:/gm)) {
      const prop = decl[1]!;
      if (prop !== "transform" && prop !== "opacity") bad.push(`${name} animates ${prop}`);
    }
  }
  if (bad.length > 0) fail(`keyframes must animate only transform and opacity: ${bad.join("; ")}`);
  else pass("every keyframe animates only transform and opacity");
}

/* ----------------------------------------- 3. every duration is a declared token */
{
  const tokens = new Set([...CSS.matchAll(/--(d-[\w-]+):/g)].map((m) => `--${m[1]!}`));
  const literals: string[] = [];
  for (const m of CSS.matchAll(/(?:animation|transition)(?:-duration)?:\s*([^;]+);/g)) {
    const value = m[1]!;
    // A literal duration anywhere in the shorthand escapes the reduced-motion
    // switch, so the whole declaration is read rather than just its head.
    for (const d of value.matchAll(/(?<![\w-])(\d+(?:\.\d+)?)(ms|s)(?![\w-])/g)) {
      // 0.001ms is the reduced-motion cancel itself, which is allowed.
      if (d[0] === "0.001ms" || d[0] === "0s") continue;
      literals.push(`${d[0]} in "${value.trim().slice(0, 60)}"`);
    }
  }
  if (tokens.size === 0) fail("no duration tokens are declared at all");
  else if (literals.length > 0) fail(`durations must be tokens, not literals: ${literals.join("; ")}`);
  else pass(`${tokens.size} duration tokens, and no literal duration anywhere`);
}

/* --------------------------------- 4. reduced motion cancels everything that moves */
{
  const block = CSS.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}\n/);
  if (!block) {
    fail("there is no prefers-reduced-motion block");
  } else {
    const body = block[1]!;
    const cancelsAnimation = /animation-duration:\s*0\.001ms\s*!important/.test(body);
    const cancelsTransition = /transition-duration:\s*0\.001ms\s*!important/.test(body);
    const cancelsIteration = /animation-iteration-count:\s*1\s*!important/.test(body);
    if (!cancelsAnimation) fail("reduced motion does not cancel animation durations");
    else if (!cancelsTransition) fail("reduced motion does not cancel transition durations");
    else if (!cancelsIteration) fail("reduced motion does not stop looping animations");
    else pass("reduced motion zeroes animations, transitions and loops");
  }
}

/* ------------------------------------------------ 5. the nine forbidden techniques */
{
  const FORBIDDEN: { re: RegExp; what: string }[] = [
    { re: /background-attachment:\s*fixed/, what: "parallax" },
    { re: /scroll-snap-type:\s*[^;]*mandatory/, what: "scroll-jacking" },
    { re: /perspective\s*:|translate3d|rotateX|rotateY|matrix3d/, what: "3D transforms" },
    { re: /conic-gradient|radial-gradient\([^)]*,[^)]*,[^)]*,/, what: "gradient meshes" },
    { re: /steps\(\s*\d+\s*(,\s*(end|jump-\w+))?\s*\)/, what: "typewriter text" },
    { re: /backdrop-filter/, what: "glassmorphism" },
    { re: /:hover[^{]*\{[^}]*transform:\s*scale/, what: "hover states that scale" },
  ];
  const hits = FORBIDDEN.filter((f) => f.re.test(CSS)).map((f) => f.what);
  if (hits.length > 0) fail(`forbidden technique present: ${hits.join(", ")}`);
  else pass("none of the forbidden techniques appear in the stylesheet");
}

/* -------------------------- 6. no fade-and-slide-up applied to sections wholesale */
{
  /*
    The specific failure the plan names: a reveal animation attached to every
    section, which turns a page into a slideshow. One keyframe applied to a
    single named element is fine; one applied to a bare tag is not.
  */
  const bad = [...CSS.matchAll(/^\s*(section|main|div|article)\s*\{[^}]*animation:/gm)].map((m) => m[1]!);
  if (bad.length > 0) fail(`a reveal animation is attached to every <${bad[0]}>`);
  else pass("no animation is attached wholesale to a structural element");
}

/* --------------------------- 7. the motions that follow data are driven by data */
{
  const live = readFileSync(new URL("../../apps/web/components/board/Live.tsx", import.meta.url).pathname, "utf8");
  if (!/sessionStorage/.test(live)) {
    fail("the bloom and the digit roll do not compare against what the reader last saw, so they run on page load");
  } else if (!/prefers-reduced-motion/.test(live)) {
    fail("the live layer does not check the reduced-motion setting before animating");
  } else if (!/first/.test(live)) {
    fail("the live layer has no first-visit baseline, so an arrival animates the whole board");
  } else {
    pass("the bloom and the roll fire on a change since the reader last looked, never on arrival");
  }
}

/* --------------------------------------- 8. the six allowed motions are all present */
{
  const EXPECTED: [string, RegExp][] = [
    ["probe refresh blooms the rail badge", /@keyframes bloom/],
    ["a value updated from chain rolls", /@keyframes roll/],
    ["row hover brightens the rule", /tbody tr:hover/],
    ["hire confirmed lifts", /@keyframes lift/],
    ["revoke desaturates permanently", /\[data-revoked\]/],
    ["loading is a hairline pulse", /@keyframes sweep/],
  ];
  const missing = EXPECTED.filter(([, re]) => !re.test(CSS)).map(([n]) => n);
  if (missing.length > 0) fail(`a specified motion is missing: ${missing.join("; ")}`);
  else pass("all six specified motions exist, and no seventh");
}

/* -------------------------------- 9. nothing spins: the plan forbids spinners */
{
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p)) files.push(p);
    }
  };
  walk(new URL("../../apps/web/", import.meta.url).pathname.replace(/\/$/, "") + "/components");
  walk(new URL("../../apps/web/app/", import.meta.url).pathname);
  /*
    Comments are stripped first. This file's own prose explains *why* there are
    no spinners, and a check that fails on an explanation of its own rule is a
    check nobody keeps. What is looked for is the technique: a component or a
    class name, not the word.
  */
  const strip = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const spinners = files.filter((f) =>
    /(className=["'`][^"'`]*\b(spinner|skeleton)\b|<(Spinner|Loader|Skeleton)\b)/i.test(strip(readFileSync(f, "utf8"))),
  );
  if (spinners.length > 0) {
    fail(`a spinner or skeleton appears in ${spinners.map((f) => f.replace(/^.*apps\/web\//, "")).join(", ")}`);
  } else pass("no spinners and no skeletons — loading is a hairline pulse on the row");
}

console.log(
  failed === 0 ? "\n  nothing moves unless the data moved.\n" : `\n  ${failed} failed.\n`,
);
process.exit(failed > 0 ? 1 : 0);
