/**
 * The worker, as commands you can run one at a time.
 *
 * `worker/src/index.ts` runs these on a loop in production. Running them
 * individually is what makes the pipeline debuggable: each stage reads the
 * stored board, does one thing, and writes it back, so a failure in the probe
 * does not cost you the sweep.
 *
 *   sweep     read the ERC-8004 registry, resumable, cursor on disk
 *   bazaar    pull Binance's B402 catalogue of paid endpoints
 *   probe     call everything we intend to list and record what happened
 *   mandate   scan the chain for capability, for the rows it could matter on
 *   metrics   compute the per-job track record from chain
 *   snapshot  rebuild the funnel from what is stored
 */

import { chainClient, resolveChain, type SupportedChain } from "@bench/shared";
import { listBazaar, toService, clusterOrigins, BazaarUnavailable, BAZAAR_LIMITATIONS } from "@bench/index";
import { countAgents, useCrawlTimeouts } from "@bench/index";
import { readTrack } from "@bench/metrics";
import { jobBySlug } from "@bench/shared";
import { unknown } from "@bench/measure";
import { sweep } from "./sweep";
import { probeAgents, probeServices, probeMandates } from "./probe-run";
import { buildSnapshot } from "./snapshot";
import { findExamples } from "./examples";
import { runCounterfactual } from "./counterfactual";
import { gradeCounterfactual } from "./grade";
import {
  HISTORY_DEPTH,
  mergeAgents,
  mergeServices,
  readBoard,
  readCursor,
  writeBoard,
  writeCursor,
  type Reading,
  type StoredBoard,
} from "./store";
import { HOUSE_AGENTS, applyHouse, houseRows } from "@bench/shared";

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/**
 * One entry per kind of limitation, newest wins.
 *
 * Limitations accumulate across cycles, and the same fact re-stated with a new
 * number is a new string: "walked back 3.5 days", then 72.9, then 0.1, all
 * sitting on the page at once as though they were three findings. So the key
 * has its numbers removed before comparison — what identifies a limitation is
 * its shape, not the figure it carried on one pass.
 *
 * The bootstrap notes are dropped outright once anything has been read. They
 * are true only of an empty deployment and describe a state that has passed.
 */
const BOOTSTRAP = ["Nothing has been read yet.", "The sweep has not run yet."];

function dedupeLimitations(all: string[], hasData: boolean): string[] {
  const byKind = new Map<string, string>();
  for (const l of all) {
    if (hasData && BOOTSTRAP.includes(l)) continue;
    /*
      Numbers out, plurals flattened. "1 block window" and "320 block windows"
      are the same finding reported on two passes, and a key that keeps either
      the figure or the plural treats them as two.
    */
    const key = l
      .toLowerCase()
      .replace(/[\d,.]+/g, "#")
      .split(/\s+/)
      .slice(0, 8)
      .map((w) => w.replace(/s$/, ""))
      .join(" ");
    byKind.set(key, l);
  }
  return [...byKind.values()];
}

/*
  The worker is not a page render, so it uses the crawl budget rather than the
  read path's four seconds. Set once, here, so no request handler can inherit
  it by importing something that quietly widened the bound.
*/
useCrawlTimeouts();

function emptyBoard(chainId: SupportedChain): StoredBoard {
  return {
    version: 1,
    chainId,
    generatedAt: new Date().toISOString(),
    agents: [],
    services: [],
    snapshot: buildSnapshot({
      chainId,
      agents: [],
      services: [],
      registered: unknown("The sweep has not run yet."),
      block: 1n,
      limitations: ["Nothing has been read yet."],
    }),
  };
}

async function load(chainId: SupportedChain): Promise<StoredBoard> {
  const board = readBoard(chainId) ?? emptyBoard(chainId);
  /*
    Our own reference agents are merged in as ordinary rows, every cycle.

    They are listed the same way as anyone else's — probed, rail by rail, with
    the same refusals — because a marketplace that seeds its own supply into
    the board by a different path is one where the two can diverge. Existing
    stored state wins, so a probe result already taken is not thrown away.
  */
  board.agents = mergeAgents(
    houseRows(chainId).filter((h) => !board.agents.some((a) => a.tokenId === h.tokenId)),
    board.agents,
  );
  return board;
}

async function save(board: StoredBoard, limitations: string[] = []) {
  const block = await chainClient(board.chainId)
    .getBlockNumber()
    .catch(() => 1n);
  const registered = await countAgents(board.chainId);
  board.snapshot = buildSnapshot({
    chainId: board.chainId,
    agents: board.agents,
    services: board.services,
    registered,
    block,
    /*
      Limitations accumulate across cycles, so the same fact re-stated with a
      new number appeared several times over — "walked back 0.2 days", then
      "0.1 days", then a stale one from a pass before that. Each kind is keyed
      by its opening words and only the newest survives, which keeps the page a
      list of what is currently true rather than a changelog of what was.
    */
    limitations: dedupeLimitations(
      [...board.snapshot.limitations, ...limitations],
      board.agents.length > 0 || board.services.length > 0,
    ),
  });
  board.generatedAt = new Date().toISOString();

  /*
    Record this cycle, so the next one can say what changed.

    A reading is only appended when something was actually probed — otherwise a
    stage that touched nothing would push a duplicate into history and the
    trending strip would report a busy market on a quiet one.
  */
  const openOn = (rail: "call" | "hire" | "mandate"): string[] => [
    ...board.agents.filter((a) => a.rails[rail].available).map((a) => `a:${a.chainId}:${a.tokenId}`),
    ...(rail === "call" ? board.services.filter((s) => s.call.available).map((s) => `s:${s.resource}`) : []),
  ];

  const reading: Reading = {
    at: board.generatedAt,
    block: board.snapshot.cutoff.block,
    totals: {
      listed: board.snapshot.totals.listed,
      callable: board.snapshot.totals.callable,
      hireable: board.snapshot.totals.hireable,
      mandatable: board.snapshot.totals.mandatable,
      probed: board.snapshot.totals.probed,
    },
    callable: openOn("call"),
    hireable: openOn("hire"),
    mandatable: openOn("mandate"),
  };

  const history = [...(board.history ?? [])];
  const last = history[history.length - 1];
  const changed =
    !last ||
    last.totals.callable !== reading.totals.callable ||
    last.totals.hireable !== reading.totals.hireable ||
    last.totals.mandatable !== reading.totals.mandatable ||
    last.totals.listed !== reading.totals.listed ||
    last.callable.join() !== reading.callable.join();
  if (changed) history.push(reading);
  board.history = history.slice(-HISTORY_DEPTH);

  writeBoard(board);
  log(
    `saved ${board.agents.length} agents, ${board.services.length} services · callable ${board.snapshot.totals.callable} · hireable ${board.snapshot.totals.hireable} · mandatable ${board.snapshot.totals.mandatable}`,
  );
}

// ---------------------------------------------------------------------------

export async function cmdSweep(chainId: SupportedChain, batches: number) {
  const board = await load(chainId);
  const cursor = readCursor(chainId);
  log(cursor?.fromBlock ? `sweeping back from block ${cursor.fromBlock}` : "sweeping back from the head");

  const r = await sweep(chainId, {
    ...(cursor?.fromBlock ? { fromBlock: BigInt(cursor.fromBlock) } : {}),
    batches,
  });
  board.agents = applyHouse(mergeAgents(board.agents, r.agents));
  writeCursor({
    chainId,
    /*
      A completed walk restarts at the head. The registry keeps minting, and the
      rows read deepest are the oldest, so cycling from the top is how the board
      stays current rather than merely growing.
    */
    /*
      Restart at the head when the walk finished or when the provider's history
      boundary was reached. Marching further into a range nothing will answer
      for spends a whole cycle to learn one thing we already know.
    */
    fromBlock: r.complete || r.boundedByProvider ? null : r.nextBlock.toString(),
    headBlock: r.headBlock.toString(),
    total: r.registered,
    updatedAt: new Date().toISOString(),
  });
  await save(board, [
    ...(r.limitation ? [r.limitation] : []),
    `This crawl has walked back ${r.depthDays.toFixed(1)} days of BNB Smart Chain from block ${r.headBlock}.`,
  ]);
  log(
    `swept ${r.agents.length} registrations, back ${r.depthDays.toFixed(1)}d` +
      (r.boundedByProvider ? " (provider history boundary, restarting at the head)" : r.complete ? ", reached genesis" : ""),
  );
}

export async function cmdBazaar(chainId: SupportedChain) {
  const board = await load(chainId);
  try {
    const { items, total, complete } = await listBazaar({ maxPages: 20 });
    const { byHost } = clusterOrigins(items.map((i) => i.resource));
    const services = items.map((i) => toService(i, byHost));
    board.services = mergeServices(board.services, services);
    await save(board, [
      ...BAZAAR_LIMITATIONS,
      ...(complete ? [] : [`The B402 catalogue reports ${total} resources and this pass read ${items.length}.`]),
    ]);
    log(`bazaar: ${items.length} of ${total} resources`);
  } catch (e) {
    const why = e instanceof BazaarUnavailable ? e.reason : String(e).slice(0, 160);
    await save(board, [`B402 Bazaar could not be read on this cycle: ${why}`]);
    log(`bazaar unavailable: ${why}`);
  }
}

export async function cmdProbe(chainId: SupportedChain, limit: number) {
  const board = await load(chainId);

  /*
    Probe the ones most likely to matter first, and the stalest after that:
    anything with an endpoint, oldest probe first. A row nobody refreshed
    inside the freshness window decays to unavailable, so this ordering is
    what keeps the board's greens true rather than merely once-true.
  */
  const candidates = board.agents
    .filter((a) => a.endpoint)
    .sort((a, b) => (a.probe?.at ?? "").localeCompare(b.probe?.at ?? ""))
    .slice(0, limit);

  const svcCandidates = board.services
    .sort((a, b) => (a.probe?.at ?? "").localeCompare(b.probe?.at ?? ""))
    .slice(0, limit);

  log(`probing ${candidates.length} agents and ${svcCandidates.length} services`);
  const [agents, services] = await Promise.all([
    probeAgents(chainId, candidates),
    probeServices(chainId, svcCandidates),
  ]);

  board.agents = applyHouse(mergeAgents(board.agents, agents));
  board.services = mergeServices(board.services, services);
  await save(board);
}

export async function cmdMandate(chainId: SupportedChain, limit: number) {
  const board = await load(chainId);
  log(`scanning capability for up to ${limit} agents`);
  board.agents = applyHouse(await probeMandates(chainId, board.agents, limit));
  await save(board);
}

export async function cmdMetrics(chainId: SupportedChain, limit: number) {
  const board = await load(chainId);
  /*
    Track records are read for the rows a person could act on. Reading them
    for the whole register would be hundreds of thousands of log scans to
    populate a column nobody is looking at.
  */
  const candidates = board.agents
    .filter((a) => a.job.known && (a.agentWallet ?? a.owner))
    .filter((a) => a.rails.call.available || a.rails.hire.available || a.rails.mandate.available || a.isOurs)
    .slice(0, limit);

  log(`reading track records for ${candidates.length} agents`);
  const updated = await Promise.all(
    candidates.map(async (a) => {
      const wallet = (a.agentWallet ?? a.owner)!;
      const job = jobBySlug(a.job.known ? a.job.value : "");
      if (!job) return a;
      try {
        const t = await readTrack(chainId, wallet, job.slug);
        return { ...a, track: t.measurements, updatedAt: new Date().toISOString() };
      } catch {
        return a;
      }
    }),
  );
  board.agents = applyHouse(mergeAgents(board.agents, updated));
  await save(board);
}

/**
 * Find one real transaction per job, for the worked examples.
 *
 * Kept as its own stage because it scans a different window than everything
 * else and because a job with no example in the last few thousand blocks is a
 * normal outcome, not a failure worth aborting a cycle over.
 */
export async function cmdExamples(chainId: SupportedChain) {
  const board = await load(chainId);
  log("looking for one real transaction per job");
  const found = await findExamples(chainId).catch((e) => {
    log(`examples failed: ${String(e).slice(0, 140)}`);
    return [];
  });
  if (found.length > 0) {
    /*
      Merged rather than replaced: a job whose work did not appear in this
      window keeps the last real example found for it, and its age is on the
      page. An example that ages is still a real transaction; an example that
      vanishes leaves the reader with nothing.
    */
    const byJob = new Map((board.examples ?? []).map((e) => [e.job, e]));
    for (const e of found) byJob.set(e.job, e);
    board.examples = [...byJob.values()];
  }
  await save(board);
  log(`examples: ${found.length} found this pass, ${board.examples?.length ?? 0} held`);
}

/**
 * Replay the reference strategies and store the result for the site to render.
 *
 * Stored whole or not at all. A partial record — some strategies replayed
 * against one window and some against another — would put two different
 * measurements in one table, which is exactly the kind of number this product
 * refuses to publish.
 */
export async function cmdCounterfactual(chainId: SupportedChain, days: number, half: number, ago = 0n) {
  const board = await load(chainId);
  log(`replaying the reference strategies over ${days} day${days === 1 ? "" : "s"} of chain ${chainId}`);
  const record = await runCounterfactual(chainId, { days, halfWidth: half, endBlocksAgo: ago }).catch((e) => {
    log(`counterfactual failed: ${String(e).slice(0, 160)}`);
    return null;
  });

  if (!record) {
    /*
      Kept rather than cleared. A window that returned too few swaps to replay
      is a fact about this pass, not a reason to delete a real measurement taken
      an hour ago — the page shows how old it is.
    */
    log("no replay this pass; the stored one is left alone");
    await save(board, [
      "The counterfactual could not be replayed in the last pass, so the figures on the agent pages are the ones from the pass before.",
    ]);
    return;
  }

  board.counterfactual = record;
  await save(board);
  const best = [...record.rows].sort((a, b) => Number(b.vsHold) - Number(a.vsHold))[0];
  log(
    `replayed ${record.swaps} swaps over ${record.hours}h of ${record.pair}` +
      (best ? ` · best against doing nothing: ${best.name} at ${Number(best.vsHold).toFixed(2)} ${record.token0Symbol}` : ""),
  );
}

/**
 * Grade the published counterfactual against everything since.
 *
 * Refuses rather than guesses when there is nothing to publish yet: no stored
 * projection, or not enough elapsed chain. Both are facts about timing and are
 * recorded as such.
 */
export async function cmdGrade(chainId: SupportedChain) {
  const board = await load(chainId);
  const published = board.counterfactual;
  if (!published) {
    log("no counterfactual has been published, so there is nothing to grade");
    return;
  }
  log(`grading the published window (blocks ${published.fromBlock}-${published.toBlock}) against everything since`);
  const grade = await gradeCounterfactual(chainId, published).catch((e) => {
    log(`grade failed: ${String(e).slice(0, 160)}`);
    return null;
  });
  if (!grade) {
    log("the following window was too quiet to grade against; the stored grade is left alone");
    return;
  }
  board.grade = grade;
  await save(board);
  if (grade.refusedBecause) {
    log(`not yet: ${grade.refusedBecause.slice(0, 120)}`);
    return;
  }
  log(
    `graded ${grade.rows.length} strategies over ${grade.actualWindow.hours}h · ` +
      `${grade.directionsHeld}/${grade.rows.length} kept the sign they were projected with`,
  );
}

export async function cmdSnapshot(chainId: SupportedChain) {
  const board = await load(chainId);
  board.agents = applyHouse(board.agents);
  await save(board);
  console.log(JSON.stringify(board.snapshot, null, 2));
}

// ---------------------------------------------------------------------------

const HELP = `bench worker

  sweep    [--batches N]   read the ERC-8004 registry, resumable
  bazaar                   pull Binance's B402 catalogue of paid endpoints
  probe    [--limit N]     call everything we intend to list
  mandate  [--limit N]     scan the chain for capability
  metrics  [--limit N]     compute per-job track records
  examples                 find one real mainnet transaction per job
  counterfactual [--days N] [--half T] [--ago BLOCKS]
                           replay the reference strategies over real pool history
  grade                    grade the published replay against the window that followed
  snapshot                 rebuild and print the funnel

  --chain 56|97            default 56
`;

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const flag = (name: string, dflt: number) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
  };
  const { chainId } = resolveChain(flag("chain", 56));

  switch (cmd) {
    case "sweep":
      return cmdSweep(chainId, flag("batches", 5));
    case "bazaar":
      return cmdBazaar(chainId);
    case "probe":
      return cmdProbe(chainId, flag("limit", 120));
    case "mandate":
      return cmdMandate(chainId, flag("limit", 12));
    case "metrics":
      return cmdMetrics(chainId, flag("limit", 40));
    case "examples":
      return cmdExamples(chainId);
    case "grade":
      return cmdGrade(chainId);
    case "counterfactual":
      return cmdCounterfactual(chainId, flag("days", 1), flag("half", 60), BigInt(flag("ago", 0)));
    case "snapshot":
      return cmdSnapshot(chainId);
    default:
      console.log(HELP);
      process.exitCode = cmd ? 1 : 0;
  }
}

/*
  Only when run directly. The commands are exported so the loop in index.ts
  calls them rather than shelling out, which keeps one implementation of each
  stage instead of two.
*/
if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { HOUSE_AGENTS };
