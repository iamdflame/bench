/**
 * Calls every classified agent's endpoint and writes the census file.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/probe-all.ts
 *
 * The logic lives in `src/lib/census/run.ts` so the same census runs, in
 * budgeted slices, from the deployed site. This script is the unbudgeted
 * form: every classified agent, one pass, then the file and, when a database
 * is configured, the `probe` snapshot too.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCensus } from "@/lib/census/run";
import { getProbes } from "@/lib/data/probes";
import { store, warm } from "@/lib/data/snapshots";
import { getAgentIndex } from "@/lib/data/agents";
import { closeDb } from "@/lib/db/client";

const OUT = join(process.cwd(), "src/data/probe.json");
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  await warm(["probe"]);
  const previous = getProbes();
  const only = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  const run = await runCensus({
    previous,
    only: only.length ? only : undefined,
    resolveConcurrency: Number(process.env.RESOLVE_CONCURRENCY ?? 8),
    probeConcurrency: 8,
    log,
  });

  writeFileSync(OUT, JSON.stringify(run.index));
  await store("probe", run.index, run.index.at).catch((e) => log("snapshot store skipped:", (e as Error).message));

  const cat = new Map(getAgentIndex().agents.map((a) => [a.tokenId, a.category ?? "unclassified"]));
  const byCat = new Map<string, { called: number; answered: number; none: number }>();
  for (const r of run.index.results) {
    const c = cat.get(r.tokenId);
    if (!c || c === "unclassified") continue;
    const b = byCat.get(c) ?? { called: 0, answered: 0, none: 0 };
    if (r.endpoint) {
      b.called += 1;
      if (r.answered) b.answered += 1;
    } else b.none += 1;
    byCat.set(c, b);
  }
  console.log();
  console.log("category              called  answered  no endpoint");
  for (const [c, b] of byCat) {
    console.log(`${c.padEnd(22)}${String(b.called).padStart(6)}${String(b.answered).padStart(10)}${String(b.none).padStart(13)}`);
  }
  console.log(`\n${run.index.answered} answered of ${run.index.probed} called; ${run.resolvedFailed} cards did not resolve (previous reading kept); ${(run.ms / 1000).toFixed(0)} s`);
  await closeDb();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
