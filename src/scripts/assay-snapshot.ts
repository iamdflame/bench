/**
 * Every listed agent, assayed once, written to a file the site can paint from.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/assay-snapshot.ts
 *
 * The agent page ran its six checks from the browser, on load. Each assay is
 * a dozen chain reads and a registry call, and measured against mainnet it
 * takes fourteen to seventeen seconds. So the first thing anybody saw on an
 * agent page was six rows reading "Checking against the chain now…", and they
 * kept reading it for long enough that a person deciding whether to spend
 * money simply left. A spinner is not a verification result.
 *
 * The fix is not a faster assay. It is to run them here, on a clock nobody is
 * watching, and commit the answers with the time and block they were taken at
 * so a reader can see exactly how fresh the reading in front of them is. The
 * live path stays: the page offers to re-run any agent's checks against the
 * chain, and that call is the one somebody can pay for.
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assayAgent } from "@/lib/assay";
import type { AssayReport } from "@/lib/assay/types";
import { getAgentIndex } from "@/lib/data/agents";
import { marketClient } from "@/lib/chain/market";

const OUT = join(process.cwd(), "src/data/assays.json");
const CONCURRENCY = Number(process.env.ASSAY_CONCURRENCY ?? 5);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

interface Snapshot {
  at: string;
  chainId: number;
  blockNumber: string | null;
  /** Assayed successfully. The rest are named rather than silently dropped. */
  assayed: number;
  failed: { tokenId: string; why: string }[];
  reports: Record<string, AssayReport>;
}

async function main() {
  const index = getAgentIndex();
  const targets = index.agents.filter((a) => a.category).map((a) => a.tokenId);
  log(`${targets.length} classified agents to assay, ${CONCURRENCY} at a time`);

  /*
    Carried forward rather than started from nothing.

    A run that fails halfway should not delete the readings it already had.
    Anything this pass cannot reach keeps its previous answer, and the file
    records when each one was actually taken.
  */
  let prior: Snapshot | null = null;
  try {
    prior = JSON.parse(readFileSync(OUT, "utf8")) as Snapshot;
  } catch {
    prior = null;
  }

  const reports: Record<string, AssayReport> = { ...(prior?.reports ?? {}) };
  const failed: { tokenId: string; why: string }[] = [];
  let done = 0;

  const queue = [...targets];
  async function worker(n: number) {
    for (;;) {
      const tokenId = queue.shift();
      if (!tokenId) return;
      const t0 = Date.now();
      try {
        const report = await assayAgent(56, tokenId, undefined, { registryDeadlineMs: 8_000 });
        reports[tokenId] = report;
        done += 1;
        log(
          `[w${n}] ${tokenId} fineness ${report.fineness} · ${report.results.filter((r) => r.verdict === "pass").length}/6 pass · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${done}/${targets.length}`,
        );
      } catch (e) {
        const why = e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120);
        failed.push({ tokenId, why });
        log(`[w${n}] ${tokenId} FAILED ${why}`);
      }
      // Written as it goes, so an interrupted run still leaves usable data.
      if (done % 10 === 0) write(reports, failed, done);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));
  await write(reports, failed, done);

  log(`done: ${done} assayed, ${failed.length} failed, ${Object.keys(reports).length} in file`);
}

let blockNumber: string | null = null;
async function write(
  reports: Record<string, AssayReport>,
  failed: { tokenId: string; why: string }[],
  assayed: number,
) {
  if (blockNumber === null) {
    blockNumber = await marketClient
      .getBlockNumber()
      .then((b) => b.toString())
      .catch(() => null);
  }
  const snapshot: Snapshot = {
    at: new Date().toISOString(),
    chainId: 56,
    blockNumber,
    assayed,
    failed,
    reports,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(snapshot));
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
