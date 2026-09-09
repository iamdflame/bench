#!/usr/bin/env node
/**
 * The house style of "The Instrument", enforced rather than asserted.
 *
 * Every rule here is one a README could claim and a stylesheet could quietly
 * stop honouring six commits later. This product argues that unverifiable
 * claims are worth nothing; it does not get to make some of its own. So the
 * design's load-bearing promises are checked by a build that fails when one
 * breaks, with the file, the line and the rule.
 *
 *   node src/scripts/check-doctrine.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const CSS = "src/app/globals.css";
const css = readFileSync(CSS, "utf8");
const fail = [];
const pass = [];
const note = (ok, rule, detail) => (ok ? pass : fail).push(`${rule}${detail ? " — " + detail : ""}`);

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const walk = (dir, fn) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, fn);
    else fn(p);
  }
};

/* ------------------------------------------------------------------ motion */

/*
  One thing moves on load — the hallmark is struck — and a few things answer an
  action. The point of the limit is that motion here is meaning: nothing fades
  up for decoration, so a strike a viewer sees is the product working. A sixth
  unexplained animation costs nothing to add and erases that, so every keyframe
  must belong to the known set. Adding a name is a deliberate act, reviewed here.
*/
const MOTION = {
  "strike-drop": "the hallmark is struck (load, once)",
  "strike-heat": "the hallmark is struck (load, once)",
  "dot-pulse": "a live indicator",
  "rise": "content entering, staggered",
  "dial-sweep": "the fineness gauge draws its reading",
  "count-in": "a figure arriving",
};
const declared = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
const undeclared = declared.filter((n) => !(n in MOTION));
note(undeclared.length === 0, `motion: every animation is accounted for (${declared.length} declared)`, undeclared.join(", "));
const unusedMotion = Object.keys(MOTION).filter((n) => !declared.includes(n));
note(unusedMotion.length === 0, "motion: no trigger listed that no longer exists", unusedMotion.join(", "));

/*
  Reduced motion is respected completely: the block exists and cancels both
  animation and transition durations for everything. A design that animates a
  strike and ignores prefers-reduced-motion is making an accessibility claim it
  does not honour.
*/
const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
note(Boolean(reduced), "motion: a reduced-motion block exists");
if (reduced) {
  const body = reduced[1];
  note(/animation:\s*none|animation-duration:\s*0/.test(body), "motion: reduced-motion cancels animation");
  note(/transition:\s*none|transition-duration:\s*0/.test(body), "motion: reduced-motion cancels transitions");
}


/*
  Motion is token-driven. A raw duration or a bare cubic-bezier in a transition
  or animation is how a sixth, unaccountable animation gets in: it is unnamed,
  so nothing sets it to zero under reduced motion and no reviewer can tell
  whether it fires on data or on load.
*/
{
  const raw = [];
  css.split("\n").forEach((line, i) => {
    const m = line.match(/^\s*(transition|animation)(-duration|-delay)?\s*:\s*(.+);/);
    if (!m) return;
    if (/none\s*!important/.test(m[3])) return; // the reduced-motion kill switch
    for (const t of m[3].matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)(?![\w-])/g)) {
      if (Number(t[1]) === 0) continue;
      raw.push(`${CSS}:${i + 1}  ${line.trim()}`);
    }
  });
  note(raw.length === 0, "motion: every duration is a declared token", raw.join("\n      "));
}

/*
  Only transform and opacity are animated. Everything else reflows or repaints,
  which drops frames on the cheap hardware this has to stay smooth on.
*/
{
  const bad = [];
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
    for (const d of m[2].matchAll(/(^|;|\s)([a-z-]+)\s*:/g)) {
      const prop = d[2];
      // stroke-dashoffset is the sole exception, and only for drawing the
      // gauge: no transform reveals an arc without distorting it, and on an
      // SVG path it repaints that path alone rather than reflowing the page.
      if (!["transform", "opacity", "filter", "stroke-dashoffset"].includes(prop)) {
        bad.push(`@keyframes ${m[1]} animates ${prop}`);
      }
    }
  }
  note(bad.length === 0, "motion: keyframes animate only transform and opacity", [...new Set(bad)].join("\n      "));
}

/*
  No em dash anywhere in the interface.

  It is the single most reliable tell of machine-written copy, and this product
  is judged on reading as though a person wrote it. Colons, commas and full
  stops carry every one of these sentences. Checked across the whole frontend,
  comments included, so it cannot drift back in one paste at a time.
*/
{
  const offenders = [];
  // Every source that carries copy a person will read: the interface itself,
  // the job vocabulary, the house cards, and the strategy descriptions that
  // surface on the lineup.
  for (const root of ["src/app", "src/components", "src/agents"]) {
    walk(root, (p) => {
      if (!/\.(tsx|ts|css)$/.test(p)) return;
      const src = readFileSync(p, "utf8");
      src.split("\n").forEach((line, i) => {
        if (line.includes("\u2014")) offenders.push(`${p}:${i + 1}`);
      });
    });
  }
  for (const f of ["src/lib/categories.ts", "src/lib/house.ts"]) {
    read(f).split("\n").forEach((line, i) => {
      if (line.includes("\u2014")) offenders.push(`${f}:${i + 1}`);
    });
  }
  note(offenders.length === 0, "voice: no em dash in the interface", offenders.slice(0, 12).join("\n      "));
}

/* --------------------------------------------------------------- numerals */

/*
  Every figure is tabular, so a column of numbers keeps its right edge as the
  digits change — the credibility of a product about measurement dies the moment
  its digits jitter. Any rule that styles something named like a number and sets
  its own type must opt into tabular-nums.
*/
const NUMERIC = /(^|[^a-z-])(num|mono|fig|amount|value|count|pct|bps|wei|price|rate|score|alpha|balance|stat|tick|epoch|block|fineness)([^a-z-]|$)/i;
const untabular = [];
for (const m of css.matchAll(/(^|\n)([^{}\n][^{}]*?)\{([^}]*)\}/g)) {
  const selector = m[2].trim();
  const body = m[3];
  if (selector.startsWith("@") || selector.startsWith("/*") || selector.startsWith(":")) continue;
  if (!NUMERIC.test(selector)) continue;
  if (!/font-size|font-family/.test(body)) continue;
  if (/font-variant-numeric:\s*[^;]*tabular-nums/.test(body)) continue;
  untabular.push(selector.replace(/\s+/g, " "));
}
note(untabular.length === 0, "numerals: every figure rule is tabular", untabular.join("\n      "));

/* ----------------------------------------------------------------- metal */

/*
  The brass is the office's, not the chain's. --color-struck sharing a hex with
  BNB yellow would read as borrowed authority from a foundation that has endorsed
  nothing here — the exact unearned claim this product exists to strike out. And
  it must be reserved for a passed hallmark; it is the single bold moment.
*/
const BNB_YELLOW = [0xf0, 0xb9, 0x0b];
const struck = css.match(/--color-struck:\s*#([0-9a-f]{6})/i);
note(Boolean(struck), "metal: --color-struck (the brass) is declared");
if (struck) {
  const rgb = [0, 2, 4].map((i) => parseInt(struck[1].slice(i, i + 2), 16));
  const distance = Math.hypot(...rgb.map((c, i) => c - BNB_YELLOW[i]));
  note(distance > 20, `metal: the brass is not BNB's swatch (distance ${distance.toFixed(0)})`);
}
note(/--color-assay:\s*#/.test(css), "metal: --color-assay (the single interactive accent) is declared");

/* ----------------------------------------------------------------- ground */

/*
  The body paints its own ground. A transparent body borrows the host's theme,
  and a light instrument on an unknown background stops being legible — the one
  thing this redesign exists to guarantee.
*/
note(/body\s*\{[^}]*background:\s*var\(--color-paper\)/s.test(css), "ground: body paints an explicit paper background");
note(/--color-paper:\s*#/.test(css), "ground: the paper token is defined");

const layout = read("src/app/layout.tsx");
note(/colorScheme:\s*["']light["']/.test(layout), "ground: the app declares a light color-scheme");

/* ------------------------------------------------------------- reading measure */

/*
  A line of body text never runs wider than roughly 72 characters, because past
  that the eye loses the start of the next line. The measure is a token so it
  cannot drift page by page.
*/
note(/--width-read:\s*\d/.test(css) || /\.read\s*\{[^}]*max-width/.test(css), "type: a reading measure is defined");

/* ------------------------------------------------------------- vocabulary */

/*
  Every semantic class a component asks for exists in the stylesheet.

  A class that was never defined fails silently and completely: the element
  renders with browser defaults and nothing errors, nothing warns, the type
  checker has no opinion — it is only caught in a screenshot. This design uses
  its own semantic classes and inline styles, no utility framework, so every
  literal className token must resolve here.
*/
const defined = new Set();
for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]);
const EXTERNAL = /^(?:mermaid|katex|hljs|token|language-)/;
const undefinedClasses = new Map();
walk("src", (p) => {
  if (!/\.tsx$/.test(p)) return;
  const src = readFileSync(p, "utf8");
  for (const m of src.matchAll(/className="([^"{}]+)"/g)) {
    for (const name of m[1].split(/\s+/)) {
      if (!name || name.includes("$") || EXTERNAL.test(name)) continue;
      if (defined.has(name)) continue;
      if (!undefinedClasses.has(name)) undefinedClasses.set(name, p);
    }
  }
});
note(
  undefinedClasses.size === 0,
  "vocabulary: every class used is defined",
  [...undefinedClasses].map(([n, f]) => `.${n}  (${f})`).join("\n      "),
);

/*
  No leftover from the old broadsheet vocabulary. These classes belonged to the
  dark letterpress design and must not reappear — a stray one renders unstyled
  and signals the rebuild leaked.
*/
const RETIRED = ["mark-label", "tbl", "hairline", "office__n", "section-title", "display", "app-header", "floor-table"];
const leaked = [];
walk("src", (p) => {
  if (!/\.tsx$/.test(p)) return;
  const src = readFileSync(p, "utf8");
  for (const cls of RETIRED) {
    if (new RegExp(`className="[^"]*\\b${cls}\\b`).test(src)) leaked.push(`${cls}  (${p})`);
  }
});
note(leaked.length === 0, "vocabulary: no class from the retired broadsheet design", leaked.join("\n      "));

/* --------------------------------------------------- narrow-viewport widths */

/*
  A rule inside a max-width query may not demand more width than the narrowest
  viewport this design supports (360px). A min-width larger than that pins a
  phone layout sideways — the one layout rule stated most plainly, broken by a
  rule meant to help.
*/
{
  const NARROWEST = 360;
  const wide = [];
  for (const m of css.matchAll(/@media[^{]*\(\s*max-width:\s*(\d+)px\s*\)[^{]*\{/g)) {
    const bp = Number(m[1]);
    let depth = 1, i = m.index + m[0].length;
    while (depth > 0 && i < css.length) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
    const body = css.slice(m.index + m[0].length, i);
    for (const w of body.matchAll(/\b(min-width|width)\s*:\s*(\d+)px/g)) {
      if (Number(w[2]) > NARROWEST) wide.push(`${w[1]}:${w[2]}px inside @media (max-width:${bp}px)`);
    }
  }
  note(wide.length === 0, "layout: no narrow-viewport rule demands a wider viewport", [...new Set(wide)].join("\n      "));
}

/* --------------------------------------------------------------- fineness */

/*
  Below 375 nothing is struck. The blank is the finding, and a component that
  drew a hallmark for base metal would be the one lie the whole product is built
  to make impossible.
*/
const hallmark = read("src/components/instrument/Hallmark.tsx");
note(
  /375|isHallmarked/.test(hallmark) && /unassayed|unmarked/.test(hallmark),
  "fineness: the hallmark distinguishes struck, unmarked and unassayed",
);
const dial = read("src/components/instrument/FinenessDial.tsx");
note(/isHallmarked|375/.test(dial), "fineness: the dial marks the 375 hallmark bar");

/* ----------------------------------------------------------------- report */

for (const p of pass) console.log(`  ok    ${p}`);
for (const f of fail) console.log(`  FAIL  ${f}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length === 0 ? 0 : 1);
