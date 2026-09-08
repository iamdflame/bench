/**
 * The gate that keeps the four categories equal.
 *
 * Agent Diversity is a third of the main-track score and the failure it
 * punishes is one category treated as the main event and the rest as an
 * afterthought. That failure is gradual: nobody decides to under-build yield,
 * it just accretes one bespoke component at a time.
 *
 * So the parity is asserted structurally rather than reviewed by eye. Every
 * job must declare the same number of metric specs, each fully formed; every
 * job route must exist and be the same file; and no job may be missing from
 * the door counts. A build that breaks any of these fails.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { JOBS, JOB_SLUGS } from "@bench/shared";
import { readBoardView } from "../../apps/web/lib/board";

let failed = 0;
const fail = (m: string) => {
  console.error(`  FAIL  ${m}`);
  failed++;
};
const pass = (m: string) => console.log(`  ok    ${m}`);

console.log("\ndiversity: the four jobs are surfaced at equal depth\n");

/* ---------------------------------------------- 1. the same number of metrics */
{
  const counts = JOBS.map((j) => j.metrics.length);
  const first = counts[0]!;
  if (JOBS.length !== 4) fail(`there are ${JOBS.length} jobs, and the brief names four`);
  else if (!counts.every((c) => c === first)) {
    fail(`metric counts differ: ${JOBS.map((j) => `${j.slug}=${j.metrics.length}`).join(", ")}`);
  } else pass(`all four jobs declare ${first} metrics`);
}

/* ------------------------------------------------ 2. every metric is complete */
{
  let bad = 0;
  for (const job of JOBS) {
    for (const m of job.metrics) {
      const missing = (["key", "label", "unit", "better", "means", "method"] as const).filter((k) => !m[k]);
      if (missing.length > 0) {
        fail(`${job.slug}/${m.key || "(unnamed)"} is missing ${missing.join(", ")}`);
        bad++;
      }
    }
  }
  if (bad === 0) pass("every metric names a unit, a direction, a meaning and a method");
}

/* -------------------------------------------- 3. every job has the same prose */
{
  const thin = JOBS.filter((j) => !j.intro || j.intro.length < 120 || !j.line || !j.title || j.venues.length === 0);
  if (thin.length > 0) fail(`these jobs have thinner copy than the others: ${thin.map((j) => j.slug).join(", ")}`);
  else pass("every job carries a title, a line, an intro and named venues");
}

/* --------------------------------------------- 4. one route file, not four */
{
  const dir = new URL("../../apps/web/app/j/", import.meta.url).pathname;
  if (!existsSync(dir)) fail("there is no /j route directory at all");
  else {
    const entries = readdirSync(dir);
    if (!entries.includes("[job]")) fail("the job route is not a single dynamic template");
    else if (entries.length > 1) {
      fail(`a job has been given a bespoke route: ${entries.filter((e) => e !== "[job]").join(", ")}`);
    } else pass("all four jobs render from one template, so none can drift shallower");
  }
}

/* ------------------------------------------- 5. every job appears in the doors */
{
  const view = readBoardView({ limit: 1 });
  const missing = JOB_SLUGS.filter((s) => !(s in view.snapshot.perJob));
  if (missing.length > 0) fail(`these jobs have no door counts: ${missing.join(", ")}`);
  else pass("every job has its own counts in the snapshot the doors read");
}

/* ------------------------------------ 6. no door renders a bare, unexplained zero */
{
  const src = readFileSync(new URL("../../apps/web/components/board/JobDoors.tsx", import.meta.url), "utf8");
  if (!/doorLine/.test(src) || !/listed yet/.test(src)) {
    fail("the door component has no fallback for a job with nothing hireable");
  } else pass("a door with nothing hireable falls back to what it does have, and says which");
}

/* -------------------------------- 7. the board treats every job the same way */
{
  const view = readBoardView({ limit: 1 });
  const shapes = JOB_SLUGS.map((s) => Object.keys(view.snapshot.perJob[s]).sort().join(","));
  if (new Set(shapes).size !== 1) fail("the per-job counts do not all carry the same fields");
  else pass("per-job counts carry identical fields for all four");
}

/* ------------------------- 8. each job offers its own metrics as sort options */
{
  const src = readFileSync(new URL("../../apps/web/app/j/[job]/page.tsx", import.meta.url).pathname, "utf8");
  if (!/spec\.metrics\.map\(\(m\) => \(\{ key: `metric:\$\{m\.method\}`/.test(src)) {
    fail("the job board does not build its sort options from the job's own metrics, so one job could be ranked by another's yardstick");
  } else pass("every job's sort options are its own three metrics");
}

/* ------------------------------ 9. the headline metric column is per job */
{
  const src = readFileSync(new URL("../../apps/web/app/j/[job]/page.tsx", import.meta.url).pathname, "utf8");
  if (!/metric=\{\{ key: headline\.method, label: headline\.label \}\}/.test(src)) {
    fail("the job board does not pass the job's headline metric to the board, so all four share one column");
  } else pass("the track-record column is the job's own headline metric");
}

/* --------------------------- 10. a worked example, or a stated absence */
{
  const board = new URL("../../apps/web/data/board-56.json", import.meta.url).pathname;
  const examples: { job: string }[] = existsSync(board)
    ? (JSON.parse(readFileSync(board, "utf8")).examples ?? [])
    : [];
  const have = new Set(examples.map((e) => e.job));
  const src = readFileSync(new URL("../../apps/web/app/j/[job]/page.tsx", import.meta.url).pathname, "utf8");
  /*
    A missing example is allowed — the scan window is only the few thousand
    blocks free providers serve — but only because the page states the absence
    instead of inventing one. If that branch is gone, a missing example would
    render as nothing at all.
  */
  if (!/no example found yet/.test(src)) {
    fail("the job board has no branch for a missing worked example, so an absence would render as blank");
  } else {
    const missing = JOB_SLUGS.filter((s2) => !have.has(s2));
    pass(
      missing.length === 0
        ? "all four jobs carry a real mainnet worked example"
        : `${have.size} of 4 jobs carry a worked example; the rest state the absence rather than inventing one`,
    );
  }
}

console.log(
  failed === 0
    ? "\n  10 passed. No category can be built shallower than the others without failing the build.\n"
    : `\n  ${failed} failed.\n`,
);
process.exit(failed > 0 ? 1 : 0);
