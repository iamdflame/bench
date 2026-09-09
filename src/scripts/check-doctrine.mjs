#!/usr/bin/env node
/**
 * The house style, enforced rather than asserted.
 *
 * Every rule in this file is one that a README could have claimed and a
 * stylesheet could have quietly stopped honouring six commits later. A
 * document that says "every figure is tabular" is worth nothing next to a
 * build that fails when one isn't, and this product does not get to argue that
 * unverifiable claims are worthless and then make some of its own.
 *
 *   node src/scripts/check-doctrine.mjs
 *
 * Exits non-zero on any violation, with the file, the line and the rule.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CSS = "src/app/globals.css";
const css = readFileSync(CSS, "utf8");
const lines = css.split("\n");
const fail = [];
const pass = [];
const note = (ok, rule, detail) => (ok ? pass : fail).push(`${rule}${detail ? " — " + detail : ""}`);

/* ---------------------------------------------------------------- motion */

/*
  Five things move, each on a chain event, each on a declared token. A raw
  duration literal in a transition or animation is how a sixth animation gets
  in: it is unnamed, so nothing sets it to zero under reduced motion, and
  nobody reviewing the diff can tell whether it fires on data or on load.
*/
const DECLARED = [
  "--d-strike",
  "--d-roll",
  "--d-deface",
  "--d-hover",
  "--d-route",
  "--d-reveal",
  "--d-pulse",
];
const rawDuration = [];
// The reduced-motion block's own 0.01ms kill-switch is the standard idiom for
// cancelling animation without cancelling animationend handlers. It is the one
// place a literal belongs.
const reducedRange = (() => {
  const start = lines.findIndex((l) => l.includes("prefers-reduced-motion: reduce"));
  if (start < 0) return [-1, -1];
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
    if (depth === 0 && i > start) return [start, i];
  }
  return [start, lines.length];
})();
lines.forEach((line, i) => {
  if (i >= reducedRange[0] && i <= reducedRange[1]) return;
  const m = line.match(/^\s*(transition|animation)(-duration|-delay)?\s*:\s*(.+);/);
  if (!m) return;
  // Ignore the keyframe/timing-function parts; only literal times are the risk.
  for (const t of m[3].matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)(?![\w-])/g)) {
    if (Number(t[1]) === 0) continue;
    rawDuration.push(`${CSS}:${i + 1}  ${line.trim()}`);
  }
});
note(
  rawDuration.length === 0,
  "motion: every duration is a declared token",
  rawDuration.join("\n      "),
);

const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
const missingZero = DECLARED.filter(
  (t) => !reduced || !new RegExp(`${t}\\s*:\\s*0m?s`).test(reduced[1]),
);
note(
  missingZero.length === 0,
  "motion: reduced-motion zeroes every token",
  missingZero.join(", "),
);

/*
  Five things move, and this is the roll.

  Every keyframe animation in the stylesheet must belong to one of the five
  chain triggers. The point of the limit is that motion here is evidence: a
  judge watching a mark get struck is watching the product work. A sixth
  animation that fires on load or on hover costs nothing to add and destroys
  that, because once things move for no reason nobody can tell a real
  settlement from theatre — and telling real from theatre is the entire claim.

  Adding a name to this list is therefore a deliberate act, reviewed as one.
*/
const MOTION = {
  "strike-descend": "assay completes",
  "strike-heat": "assay completes",
  "strike-impact": "assay completes",
  "roll-over": "chain value changes",
  deface: "dismissal",
  "hair-pulse": "fetching",
  "seg-pulse": "fetching",
  "hair-glow": "fetching",
  "route-in": "route change",
};
const declared = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
const undeclaredMotion = declared.filter((n) => !(n in MOTION));
note(
  undeclaredMotion.length === 0,
  `motion: every animation belongs to a chain trigger (${declared.length} declared)`,
  undeclaredMotion.join(", "),
);
const unused = Object.keys(MOTION).filter((n) => !declared.includes(n));
note(unused.length === 0, "motion: no trigger listed that no longer exists", unused.join(", "));

/* ------------------------------------------------------------- numerals */

/*
  Every figure is tabular, so a column of numbers keeps its right edge as the
  digits change. Checked by vocabulary: any rule that styles something named
  like a number and sets its own type must opt in.
*/
// `__n` is this codebase's suffix for a bare count, and it was missing from
// the first version of this list — which is exactly how .office__n came to set
// its own font-size and inherit its numerals from a sibling class.
const NUMERIC =
  /(^|[^a-z-])(num|fig|figure|amount|value|count|pct|bps|wei|price|rate|score|alpha|balance|stat|tick|epoch|block)([^a-z-]|$)|__n\b/i;
const untabular = [];
for (const m of css.matchAll(/(^|\n)([^{}\n][^{}]*?)\{([^}]*)\}/g)) {
  const selector = m[2].trim();
  const body = m[3];
  if (selector.startsWith("@") || selector.startsWith("/*")) continue;
  if (!NUMERIC.test(selector)) continue;
  // Only rules that set their own type can be responsible for their numerals.
  if (!/font-size|font-family/.test(body)) continue;
  if (/font-variant-numeric:\s*[^;]*tabular-nums/.test(body)) continue;
  untabular.push(`${selector.replace(/\s+/g, " ")}`);
}
note(untabular.length === 0, "numerals: every figure rule is tabular", untabular.join("\n      "));

const badVariant = [];
for (const m of css.matchAll(/font-variant-numeric:\s*([^;]+);/g)) {
  if (!/tabular-nums/.test(m[1])) badVariant.push(m[1].trim());
}
note(badVariant.length === 0, "numerals: no proportional override", badVariant.join(", "));

/* ---------------------------------------------------------------- metal */

/*
  The gold is the office's, not the chain's. Sharing a hex with BNB yellow
  would read as borrowed authority from a foundation that has endorsed nothing
  here, which is the exact species of unearned claim this product exists to
  strike out.
*/
const BNB_YELLOW = [0xf0, 0xb9, 0x0b];
const gold = css.match(/--gold-999:\s*#([0-9a-f]{6})/i);
note(Boolean(gold), "metal: --gold-999 is declared");
if (gold) {
  const rgb = [0, 2, 4].map((i) => parseInt(gold[1].slice(i, i + 2), 16));
  const distance = Math.hypot(...rgb.map((c, i) => c - BNB_YELLOW[i]));
  /*
    Both are golds, and an assay office's gold could not honestly be anything
    else. What this catches is the swatch being taken rather than the family
    being shared: #E8A317 is a deeper, redder metal chosen for this office, and
    the day it drifts back onto #F0B90B the mark starts borrowing an
    endorsement from a foundation that has given none.
  */
  note(distance > 20, `metal: --gold-999 is not BNB's swatch (distance ${distance.toFixed(0)})`);
}

/*
  Red means one thing here: a mark that was struck and has been defaced. Used
  anywhere else it becomes decoration, and the one place it has to carry
  meaning stops carrying it.
*/
const DEFACE =
  /deface|cancel|cut|wiped|dead|struck|strike|slash|challenge|void|refus|negativ|breach|fail|flag|adverse|loss|stale|down|dismiss|error|halt|unpaid|restat|discontinu/i;
const strayRed = [];
for (const m of css.matchAll(/(^|\n)([^{}\n][^{}]*?)\{([^}]*)\}/g)) {
  const selector = m[2].trim();
  if (selector.startsWith("@") || selector.startsWith("/*")) continue;
  if (!/var\(--cancelled\)/.test(m[3])) continue;
  if (DEFACE.test(selector)) continue;
  strayRed.push(selector.replace(/\s+/g, " "));
}
note(strayRed.length === 0, "metal: red only on defacement", strayRed.join("\n      "));

/* ---------------------------------------------------------------- density */

const row = css.match(/--row:\s*(\d+)px/);
note(row && row[1] === "44", "density: table row is 44px", row ? `${row[1]}px` : "absent");

/*
  Tables, not cards. A card grid is how a register turns into a brochure: it
  destroys the column edge that makes two rows comparable at a glance, which is
  the only reason to publish a register at all.
*/
const cardish = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(p)) {
      const src = readFileSync(p, "utf8");
      const m = src.match(/className="[^"]*\bcards?\b[^"]*"/);
      if (m) cardish.push(`${p}  ${m[0]}`);
    }
  }
};
walk("src");
note(cardish.length === 0, "density: no card classes", cardish.join("\n      "));

/* ------------------------------------------------------------- vocabulary */

/*
  Every class a component asks for must exist in the stylesheet.

  A class name that was never defined fails silently and completely: the
  element renders with browser defaults, which on a table means no hairlines,
  no 44px rows, no tabular column edge — the exact opposite of the house style,
  shipped looking like an unstyled document. Nothing errors, nothing warns, and
  the type checker has no opinion, so it reaches production and is only caught
  by someone looking at a screenshot.

  This happened: an office page asked for `.ledger-table`, `.table-wrap` and
  `.visually-hidden` when the vocabulary is `.floor-table`, `.tablewrap` and
  `.sr-only`. It was deployed before a screenshot showed it.
*/
const defined = new Set();
for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]);

/* Names that legitimately never appear in globals.css. */
const EXTERNAL = /^(?:mermaid|katex|hljs|leaflet|maplibregl|token|language-)/;

/*
  Hooks that carry no styling of their own, on purpose.
  
  Each renders correctly by inheriting from a styled parent, and each is here
  because it was checked rather than because the list was inconvenient. They
  are kept as names so a stylesheet can reach them later and so the markup says
  what each block is. A class added in error looks identical to the checker,
  which is why removing one from this list must mean looking at the element.
*/
const UNSTYLED_HOOKS = new Set([
  // Block wrappers whose every child is styled.
  "autopsy",
  "bench",
  "hire",
  "replay",
  // SVG roots, sized by their own attributes and by the parent's layout.
  "category-mark",
  "date-letter",
  "fineness-mark",
  "office-mark",
  "sponsor-mark",
  // Inherit from a styled ancestor: .obs__stamp, .att__row, .api__body.
  "obs__age",
  "att__match",
  "api__ep",
]);

const undefinedClasses = new Map();
const walkTsx = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      walkTsx(p);
      continue;
    }
    if (!/\.tsx$/.test(p)) continue;
    const src = readFileSync(p, "utf8");
    // Only literal className strings: a computed one cannot be checked here
    // and must not be guessed at.
    for (const m of src.matchAll(/className=\{?"([^"]+)"/g)) {
      for (const name of m[1].split(/\s+/)) {
        if (!name || name.includes("$") || EXTERNAL.test(name)) continue;
        if (UNSTYLED_HOOKS.has(name)) continue;
        if (defined.has(name)) continue;
        if (!undefinedClasses.has(name)) undefinedClasses.set(name, p);
      }
    }
  }
};
walkTsx("src");
note(
  undefinedClasses.size === 0,
  "vocabulary: every class used is defined",
  [...undefinedClasses].map(([n, f]) => `.${n}  (${f})`).join("\n      "),
);

/* ------------------------------------------------------------ table layout */

/*
  A table cell keeps `display: table-cell`.

  Setting `flex` or `grid` on a `<th>` or `<td>` replaces that, and the cell
  stops contributing its height to its row: a two-line cell then renders its
  second line over the row beneath it. /offices shipped four office names
  printed across four rows of figures for exactly this reason, and it is
  invisible in review because the rule and the markup are in different files.

  Any class used on a `th` or `td` in a .tsx must not set a display that takes
  the element out of table layout. Put the layout on a span inside the cell.
*/
{
  const cellClasses = new Set();
  const walkCells = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        walkCells(p);
        continue;
      }
      if (!/\.tsx$/.test(p)) continue;
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/<(?:th|td)\b[^>]*className=\{?"([^"]+)"/g)) {
        for (const name of m[1].split(/\s+/)) if (name && !name.includes("$")) cellClasses.add(name);
      }
    }
  };
  walkCells("src");

  const offenders = [];
  for (const name of cellClasses) {
    // The rule body for this exact class, wherever it is declared.
    const re = new RegExp(`(^|[,}])\\s*[^{}]*\\.${name}\\b[^{}]*\\{([^}]*)\\}`, "gm");
    for (const m of css.matchAll(re)) {
      if (/display:\s*(flex|grid|inline-flex|inline-grid|block)/.test(m[2])) {
        offenders.push(`.${name} sets a non-table display on a th/td`);
      }
    }
  }
  note(
    offenders.length === 0,
    "layout: no table cell is taken out of table layout",
    offenders.join("\n      "),
  );
}

/* ------------------------------------------------------- cell specificity */

/*
  A cell rule has to out-rank the cell defaults.

  `.tbl td` sets `white-space: nowrap`, and it carries an element as well as a
  class — so a bare `.my-cell { white-space: normal }` loses to it and the
  column renders as one clipped line. It happened on three pages at once, and
  it is invisible in review because the losing rule is right there and looks
  correct.

  Any class used on a th/td that overrides a property `.tbl td` sets must name
  the element too.
*/
{
  const guarded = ["white-space", "height"];
  const cellClasses = new Set();
  const walkCells2 = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        walkCells2(p);
        continue;
      }
      if (!/\.tsx$/.test(p)) continue;
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/<(?:th|td)\b[^>]*className=\{?"([^"]+)"/g)) {
        for (const name of m[1].split(/\s+/)) if (name && !name.includes("$")) cellClasses.add(name);
      }
    }
  };
  walkCells2("src");

  const weak = [];
  for (const name of cellClasses) {
    const re = new RegExp(`(^|[,}])\\s*([^{}]*\\.${name}\\b[^{}]*)\\{([^}]*)\\}`, "gm");
    for (const m of css.matchAll(re)) {
      const sel = m[2].trim();
      const body = m[3];
      if (/\b(td|th)\b/.test(sel)) continue;
      for (const prop of guarded) {
        if (new RegExp(`(^|;|\\s)${prop}\\s*:`).test(body)) {
          weak.push(`.${name} overrides ${prop} without naming td/th, so .tbl td wins`);
        }
      }
    }
  }
  note(
    weak.length === 0,
    "layout: a cell rule out-ranks the cell defaults",
    [...new Set(weak)].join("\n      "),
  );
}

/* --------------------------------------------------- narrow-viewport widths */

/*
  A rule inside a `max-width` query may not demand more width than the query.

  `@media (max-width: 900px) { .msheet { min-width: 720px } }` was written to
  keep a wide table readable inside its own scroller. The class collided with
  `<main className="shell method">` on two other pages, and the effect was that
  those documents were pinned to 720px on a 390px phone and scrolled sideways
  — the layout rule this project states most plainly, broken by the rule meant
  to protect it.

  Anything set inside a narrow-viewport query that is wider than the breakpoint
  is either a mistake or belongs on an inner scroller instead.
*/
{
  /*
    The floor of the range, not the ceiling of the query.

    A `max-width: 900px` block applies at 390px too, so comparing against 900
    passed the exact rule that broke the phone. The bar is the narrowest
    viewport this design supports.

    Tables are exempt: a wide table is meant to have a min-width and scroll
    inside `.tablewrap`, which is the correct pattern rather than a violation
    of it. Only classes actually used on a `<table>` get that exemption.
  */
  const NARROWEST = 375;
  const tableClasses = new Set();
  const walkTables = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        walkTables(p);
        continue;
      }
      if (!/\.tsx$/.test(p)) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/<table\b[^>]*className=\{?"([^"]+)"/g)) {
        for (const n of m[1].split(/\s+/)) if (n && !n.includes("$")) tableClasses.add(n);
      }
    }
  };
  walkTables("src");

  const wide = [];
  const mediaRe = /@media[^{]*\(\s*max-width:\s*(\d+)px\s*\)[^{]*\{/g;
  for (const m of css.matchAll(mediaRe)) {
    const breakpoint = Number(m[1]);
    let depth = 1;
    let i = m.index + m[0].length;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    const body = css.slice(m.index + m[0].length, i);
    for (const d of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sel = d[1].trim().split("\n").pop().trim();
      const onATable = [...tableClasses].some((c) => sel.includes(`.${c}`));
      if (onATable) continue;
      for (const w of d[2].matchAll(/\b(min-width|width)\s*:\s*(\d+)px/g)) {
        if (Number(w[2]) > NARROWEST) {
          wide.push(
            `${sel} sets ${w[1]}:${w[2]}px inside @media (max-width: ${breakpoint}px), which also applies at ${NARROWEST}px`,
          );
        }
      }
    }
  }
  note(
    wide.length === 0,
    "layout: no narrow-viewport rule demands a wider viewport",
    [...new Set(wide)].join("\n      "),
  );
}

/* ------------------------------------------------------- one owner per class */

/*
  A class name has one owner.

  Twice now a new layout class has been given a name another page already used.
  `.method` was `<main className="shell method">` on /assay and /api before it
  was a table on the front page, and the table's mobile `min-width` pinned
  those documents to 720px. `.sheet` was the floor's fixed-position modal
  before it was a twelve-column grid, so the grid rendered at `inset: 0` and
  its content escaped the page gutter entirely.

  Both are invisible in review: each rule is correct on its own, and nothing
  fails until the two meet on one element. So a bare `.x { }` rule declared in
  more than one place must not disagree about the properties that decide where
  a box lives.
*/
{
  const structural = ["display", "position"];
  const owners = new Map();

  /*
    Top-level rules only. A `@media` block redeclaring `display` or `position`
    is a responsive change and the whole point of having one — the collisions
    this looks for are two unconditional rules that disagree.
  */
  let flat = "";
  {
    let i = 0;
    while (i < css.length) {
      const at = css.indexOf("@", i);
      if (at === -1) { flat += css.slice(i); break; }
      flat += css.slice(i, at);
      const open = css.indexOf("{", at);
      if (open === -1) break;
      let depth = 1, j = open + 1;
      while (depth > 0 && j < css.length) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
        j++;
      }
      i = j;
    }
  }

  for (const m of flat.matchAll(/(^|\})\s*\.([a-z0-9_-]+)\s*\{([^}]*)\}/gim)) {
    const name = m[2];
    const body = m[3];
    for (const prop of structural) {
      const hit = new RegExp(`(^|;|\\s)${prop}\\s*:\\s*([^;]+)`, "i").exec(body);
      if (!hit) continue;
      const key = `${name}|${prop}`;
      const value = hit[2].trim();
      const prev = owners.get(key);
      if (prev && prev !== value) {
        owners.set(key, `CONFLICT:${prev} vs ${value}`);
      } else if (!prev) {
        owners.set(key, value);
      }
    }
  }
  const clashes = [...owners]
    .filter(([, v]) => String(v).startsWith("CONFLICT:"))
    .map(([k, v]) => `.${k.split("|")[0]} declares ${k.split("|")[1]} twice — ${String(v).slice(9)}`);
  note(
    clashes.length === 0,
    "vocabulary: a class name has one owner",
    clashes.join("\n      "),
  );
}

/* ----------------------------------------------- media queries that override */

/*
  A media query has to come after the rule it overrides.

  CSS resolves equal specificity by document order, and a `@media` block does
  not raise specificity — so `@media (max-width: 560px) { .x { … } }` written
  above an unconditional `.x { … }` loses to it, silently, at every width. The
  office page's phone layout was written, deployed, and never once applied for
  exactly this reason: the queries were placed beside a related class that
  happened to be declared earlier in the file.

  It is invisible in review because both rules read correctly and the media
  query looks like it is doing something. Checked for every class whose
  properties are set in both places.
*/
{
  const conditional = new Map();
  const mediaRe = /@media[^{]*\{/g;
  for (const m of css.matchAll(mediaRe)) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    const body = css.slice(m.index + m[0].length, i);
    for (const d of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sel = d[1].trim().split("\n").pop().trim();
      for (const cm of sel.matchAll(/\.([a-z0-9_-]+)/gi)) {
        const props = [...d[2].matchAll(/(^|;|\s)([a-z-]+)\s*:/g)].map((x) => x[2]);
        const key = cm[1];
        const at = m.index;
        const prev = conditional.get(key);
        if (!prev || at < prev.at) conditional.set(key, { at, props: new Set(props) });
        else for (const p of props) prev.props.add(p);
      }
    }
  }

  /*
    Only rules outside every `@media` count as unconditional. Blanking the
    media bodies rather than removing them keeps every byte offset intact, so
    a position found here is still comparable with the query positions above.
  */
  let outside = css;
  for (const m of css.matchAll(/@media[^{]*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    outside =
      outside.slice(0, m.index) +
      " ".repeat(i - m.index) +
      outside.slice(i);
  }

  const late = [];
  for (const [name, { at, props }] of conditional) {
    // The last unconditional declaration of this exact class.
    const re = new RegExp(`(^|\\})\\s*\\.${name}\\s*\\{([^}]*)\\}`, "gm");
    for (const m of outside.matchAll(re)) {
      /*
        The match may begin at a line start well before the selector, because
        `\s*` runs back across the blanked media block. Compare the position of
        the selector itself, or every rule looks like it comes first.
      */
      const selAt = m.index + m[0].indexOf(`.${name}`);
      if (selAt < at) continue;
      const declared = [...m[2].matchAll(/(^|;|\s)([a-z-]+)\s*:/g)].map((x) => x[2]);
      const clash = declared.filter((p) => props.has(p));
      if (clash.length) {
        late.push(`.${name} is set unconditionally after its @media block — ${[...new Set(clash)].join(", ")} will never respond`);
      }
    }
  }
  note(
    late.length === 0,
    "layout: a media query comes after the rule it overrides",
    [...new Set(late)].join("\n      "),
  );
}

/* --------------------------------------------------------------- fineness */

/*
  Below 375 nothing is struck. The blank is the finding, and a component that
  quietly drew a shield for base metal would be the one lie the whole product
  is built to make impossible.
*/
const hallmark = readFileSync("src/components/mark/Hallmark.tsx", "utf8");
note(
  /375/.test(hallmark) && /(< *375|375 *>|below 375)/i.test(hallmark),
  "fineness: no mark is struck below 375",
);

/* ----------------------------------------------------------------- report */

for (const p of pass) console.log(`  ok    ${p}`);
for (const f of fail) console.log(`  FAIL  ${f}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length === 0 ? 0 : 1);
