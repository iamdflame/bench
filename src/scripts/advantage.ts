/**
 * Runs the Agent Advantage Report against the locked anchor.
 *
 *   npx tsx --env-file=.env --env-file=.env.local src/scripts/advantage.ts run
 *   npx tsx ... src/scripts/advantage.ts run --only T1,T2
 *
 * Reads docs/advantage/INPUT_LOCK.json, refuses to run if the specification in
 * src/advantage/lock.ts no longer hashes to what was committed on chain, and
 * writes results to docs/advantage/results/. Rendering the markdown is a
 * separate step so that a re-render can never quietly change a measurement.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { specHash, TASKS, WINDOW_BLOCKS, type Anchor } from "@/advantage/lock";
import { stats } from "@/advantage/chain";
import {
  gasPriceAt,
  readPath,
  scanAllPools,
  readPositions,
  scorePositions,
  simulateGrid,
  tickAt,
  DRIFT_TICKS,
  priceFrom,
} from "@/advantage/tasks/pool";
import { readHealth, readMarkets, scoreYield } from "@/advantage/tasks/venus";
import { runT5, runT6 } from "@/advantage/tasks/security";

const root = process.cwd();
const lockPath = join(root, "docs/advantage/INPUT_LOCK.json");
const resultsDir = join(root, "docs/advantage/results");

if (!existsSync(lockPath)) {
  console.error("\n  no input lock. Run advantage-lock.ts first — the method is fixed before the run.\n");
  process.exit(1);
}
const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { anchor: Anchor };
const anchor = lock.anchor;

// The lock is only worth something if the code still matches it.
const now = specHash();
if (now !== anchor.specHash) {
  console.error(`\n  the specification has changed since it was locked.`);
  console.error(`    committed on chain  ${anchor.specHash}`);
  console.error(`    src/advantage/lock  ${now}`);
  console.error(`\n  refusing to run. Either restore the spec or lock a new one and say so.\n`);
  process.exit(1);
}

const only = (() => {
  const i = process.argv.indexOf("--only");
  return i === -1 ? null : new Set((process.argv[i + 1] ?? "").split(",").map((s) => s.trim()));
})();
const wanted = (id: string) => !only || only.has(id);

const log = (...a: unknown[]) => console.log(...a);
const bar = (done: number, total: number, found: number) =>
  process.stdout.write(`\r    scanning ${done}/${total} windows · ${found} logs`.padEnd(64));

mkdirSync(resultsDir, { recursive: true });
const save = (id: string, value: unknown) =>
  writeFileSync(
    join(resultsDir, `${id}.json`),
    `${JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`,
  );

const fromBlock = BigInt(anchor.fromBlock);
const anchorBlock = BigInt(anchor.anchorBlock);

log(`\n  anchor   block ${anchor.anchorBlock} · ${anchor.lockedAt}`);
log(`  window   ${anchor.fromBlock} → ${anchor.anchorBlock}  (${WINDOW_BLOCKS} blocks)`);
log(`  lock tx  ${anchor.txHash}`);
log(`  spec     ${anchor.specHash.slice(0, 22)}… verified against src/advantage/lock.ts\n`);

const gas = await gasPriceAt(anchorBlock);
const gasPrice = gas.wei;
log(`  gas price at the anchor block: ${Number(gasPrice) / 1e9} gwei (median of ${gas.sampled} transactions in that block)\n`);

// ---------------------------------------------------------------- T1 and T2
if (wanted("T1") || wanted("T2")) {
  log(`  ${TASKS[0]!.id}/${TASKS[1]!.id}  reading every swap in the pool over the window`);
  const path = await readPath(fromBlock, anchorBlock, bar);
  process.stdout.write("\r".padEnd(64) + "\r");
  log(`    ${path.length} swaps recovered`);

  const { tick: anchorTick } = await tickAt(anchorBlock);
  log(`    pool tick at the anchor block: ${anchorTick}`);

  if (wanted("T1")) {
    const spec = TASKS[0]!;
    const sampleSize = Number(spec.inputs.sampleSize);
    log(`\n  T1  sampling live positions in this pool`);
    const { sampled, candidates } = await readPositions(fromBlock, anchorBlock, sampleSize, bar);
    process.stdout.write("\r".padEnd(64) + "\r");
    scorePositions(sampled, path, anchorTick, anchor.anchorBlock);

    const out = sampled.filter((p) => p.outOfRange);
    const churn = sampled.filter((p) => p.wouldHaveChurned);
    const flagged = sampled.filter((p) => p.driftAtAnchor >= DRIFT_TICKS);
    const idle = out.map((p) => p.blocksIdle).filter((b): b is number => b !== null);
    const median = idle.length ? [...idle].sort((a, b) => a - b)[Math.floor(idle.length / 2)]! : null;

    log(`    ${candidates} positions touched in the window · ${sampled.length} live in this pool`);
    log(`    out of range at the anchor block: ${out.length}/${sampled.length} (${((out.length / Math.max(sampled.length, 1)) * 100).toFixed(1)}%)`);
    log(`    past the ${DRIFT_TICKS}-tick trigger:  ${flagged.length}`);
    log(`    median blocks idle: ${median ?? "n/a"}${median ? ` (~${((median * 0.45) / 60).toFixed(1)} min)` : ""}`);
    log(`    LOSS — would have churned: ${churn.length}`);

    save("T1", {
      taskId: "T1",
      anchorBlock: anchor.anchorBlock,
      anchorTick,
      candidates,
      sampled: sampled.length,
      outOfRange: out.length,
      pastTrigger: flagged.length,
      wouldHaveChurned: churn.length,
      medianBlocksIdle: median,
      driftTicks: DRIFT_TICKS,
      positions: sampled,
    });
  }

  if (wanted("T2")) {
    const spec = TASKS[1]!;
    const minSwaps = 200;
    log(`\n  T2  running the production grid over the observed path`);
    if (path.length < minSwaps) {
      log(`    INCONCLUSIVE — ${path.length} swaps, under the ${minSwaps} declared in the lock`);
      save("T2", { taskId: "T2", verdict: "inconclusive", swaps: path.length, minSwaps });
    } else {
      // 60s of block time, matching the epoch length the market runs on mainnet.
      const cadenceBlocks = 133;
      const sim = await simulateGrid(path, {
        capitalBnb: Number(spec.inputs.capitalBnb),
        cadenceBlocks,
        gasPriceWei: gasPrice,
        swapGas: 150_000n,
      });
      log(`    price ${sim.startPriceUsd.toFixed(2)} → ${sim.endPriceUsd.toFixed(2)} (${sim.trendPct >= 0 ? "+" : ""}${sim.trendPct.toFixed(2)}%)`);
      log(`    ${sim.evaluations} evaluations · ${sim.fills} fills`);
      log(`    agent ${sim.agentBnb.toFixed(8)} BNB · hold ${sim.holdBnb.toFixed(8)} BNB`);
      log(`    ${sim.netAdvantageBnb >= 0 ? "WIN" : "LOSS"} — ${sim.netAdvantageBnb >= 0 ? "+" : ""}${sim.netAdvantageBnb.toFixed(8)} BNB against holding`);
      save("T2", { taskId: "T2", cadenceBlocks, swaps: path.length, swapGas: 150000, gasPriceWei: gasPrice.toString(), gasSampled: gas.sampled, capitalBnb: Number(spec.inputs.capitalBnb), ...sim });
    }
  }
}

// ---------------------------------------------------------------- T3 and T4
if (wanted("T3") || wanted("T4")) {
  const { sqrtPriceX96 } = await tickAt(anchorBlock);
  const bnbUsd = priceFrom(sqrtPriceX96);
  log(`\n  BNB at the anchor block: $${bnbUsd.toFixed(2)} (from the pool, at that block)`);

  if (wanted("T3")) {
    const spec = TASKS[2]!;
    log(`\n  T3  Venus supply rates at the anchor block`);
    const markets = await readMarkets(anchorBlock);
    const r = scoreYield(markets, {
      blocksPerYear: Number(spec.inputs.blocksPerYear),
      capitalUsd: Number(spec.inputs.capitalUsd),
      gasPriceWei: gasPrice,
      bnbUsd,
    });
    log(`    ${markets.length} markets read · ${r.markets.length} paying a positive rate`);
    if (r.best && r.worst) {
      log(`    LOCKED METRIC (as specified, no liquidity filter)`);
      log(`      best  ${r.best.symbol.padEnd(10)} ${r.best.supplyApyPct.toFixed(2)}%  cash $${r.best.cashUsd.toFixed(0)}`);
      log(`      worst ${r.worst.symbol.padEnd(10)} ${r.worst.supplyApyPct.toFixed(2)}%  cash $${r.worst.cashUsd.toFixed(0)}`);
      log(`      spread ${r.spreadPct.toFixed(2)} points`);
      if (r.best.cashUsd < 1000) {
        log(`      ^ this is not an opportunity. The top market holds $${r.best.cashUsd.toFixed(2)} of cash;`);
        log(`        nothing can be supplied into it. The locked metric is flawed and it is`);
        log(`        reported anyway, because it may not be repaired after seeing the result.`);
      }
      log(`    EXPLORATORY (markets holding at least $${r.liquid.minCashUsd.toLocaleString()})`);
      if (r.liquid.best && r.liquid.worst) {
        log(`      ${r.liquid.count} markets qualify`);
        log(`      best  ${r.liquid.best.symbol.padEnd(10)} ${r.liquid.best.supplyApyPct.toFixed(2)}%  cash $${(r.liquid.best.cashUsd / 1e6).toFixed(1)}M`);
        log(`      worst ${r.liquid.worst.symbol.padEnd(10)} ${r.liquid.worst.supplyApyPct.toFixed(2)}%  cash $${(r.liquid.worst.cashUsd / 1e6).toFixed(1)}M`);
        log(`      spread ${r.liquid.spreadPct.toFixed(2)} points`);
      }
      log(`    one rotation costs $${r.gasCostUsd.toFixed(4)} at ${Number(gasPrice) / 1e9} gwei`);
      log(`    break-even capital (on the actionable spread): $${r.breakEvenUsd.toFixed(2)}`);
      log(`    at the locked $${r.capitalUsd}: $${r.gainPerMonthUsd.toFixed(2)}/month against $${r.gasCostUsd.toFixed(4)} of gas`);
      log(`    ${r.capitalUsd >= r.breakEvenUsd ? "WIN" : "LOSS"} — rotation ${r.capitalUsd >= r.breakEvenUsd ? "repays itself" : "does not repay itself"} at the locked capital`);
    }
    save("T3", { taskId: "T3", anchorBlock: anchor.anchorBlock, bnbUsd, ...r });
  }

  if (wanted("T4")) {
    log(`\n  T4  Venus liquidation economics at the anchor block`);
    const VENUS_MARKETS = [
      "0xA07c5b74C9B40447a954e1466938b865b6BBea36", // vBNB
      "0xfD5840Cd36d94D7229439859C0112a4185BC0255", // vUSDT
      "0x95c78222B3D6e262426483D42CfA53685A67Ab9D", // vBUSD
    ];
    const h = await readHealth(anchorBlock, {
      fromBlock,
      gasPriceWei: gasPrice,
      bnbUsd,
      exampleBorrowUsd: 10_000,
      markets: VENUS_MARKETS,
    });
    log(`    liquidationIncentive ${h.liquidationIncentiveMantissa} → borrower loses ${h.penaltyPct.toFixed(1)}% of seized collateral`);
    log(`    closeFactor          ${h.closeFactorMantissa} → up to ${h.closeFactorPct.toFixed(0)}% of the borrow taken at once`);
    log(`    on a $${h.exampleBorrowUsd.toLocaleString()} borrow: being late costs $${h.penaltyUsd.toFixed(2)}`);
    log(`    one pre-emptive repayBorrow costs $${h.repayGasUsd.toFixed(4)} of gas`);
    log(`    WIN — being early is ${Math.round(h.ratio).toLocaleString()}× cheaper than being late`);
    if ("count" in h.liquidations) {
      log(`    real liquidations in the window: ${h.liquidations.count} across vBNB/vUSDT/vBUSD`);
    } else {
      log(`    INCONCLUSIVE on counts — ${h.liquidations.inconclusive}`);
    }
    save("T4", { taskId: "T4", anchorBlock: anchor.anchorBlock, bnbUsd, ...h });
  }
}

// ---------------------------------------------------------------- T5 and T6
if (wanted("T5")) {
  const spec = TASKS[4]!;
  log(`\n  T5  assaying ${spec.inputs.sampleSize} registry agents against their own cards`);
  const r = await runT5(Number(spec.inputs.chainId), Number(spec.inputs.sampleSize), (done, total, id) =>
    process.stdout.write(`\r    ${done}/${total} · agent ${id}`.padEnd(48)),
  );
  process.stdout.write("\r".padEnd(48) + "\r");
  log(`    by the card alone, hireable: ${r.hireableByCard}/${r.sampled}`);
  log(`    by the assay, hallmarked:    ${r.hireableByAssay}/${r.sampled}`);
  log(`    cards the chain contradicts: ${r.contradicted}/${r.sampled}`);
  log(`    LOSS — inconclusive checks:  ${r.inconclusiveChecks} across ${r.agentsWithInconclusive} agents`);
  log(`    ${(r.totalMs / 1000).toFixed(1)}s total · ${(r.msPerAgent / 1000).toFixed(1)}s per agent`);
  save("T5", { taskId: "T5", ...r });
}

if (wanted("T6")) {
  const spec = TASKS[5]!;
  log(`\n  T6  profiling the registry's feedback corpus`);
  const r = await runT6(
    Number(spec.inputs.chainId),
    Number(spec.inputs.feedbackPages),
    Number(spec.inputs.pageSize),
    (fetched, total) => process.stdout.write(`\r    ${fetched}/${total} feedbacks`.padEnd(40)),
  );
  process.stdout.write("\r".padEnd(40) + "\r");
  log(`    ${r.feedbacksAnalysed} feedbacks · ${r.pagesReturned}/${r.pagesRequested} pages${r.partial ? " (PARTIAL — rate limited)" : ""}`);
  log(`    distinct reviewer wallets: ${r.distinctReviewers}`);
  log(`    flagged as coordinated:    ${r.flaggedReviewers} (${((r.flaggedReviewers / Math.max(r.distinctReviewers, 1)) * 100).toFixed(1)}%)`);
  log(`    share of all feedback written by flagged wallets: ${r.flaggedShareOfFeedback.toFixed(1)}%`);
  log(`    top reviewers:`);
  for (const t of r.topReviewers) {
    log(`      ${t.address.slice(0, 12)}…  ${t.feedbacks} feedbacks across ${t.agents} agents (max ${t.maxPerAgent} on one)`);
  }
  log(`    threshold sensitivity (jaccard → flagged):`);
  log(`      ${r.sensitivity.map((s) => `${s.jaccard}:${s.flagged}`).join("  ")}`);
  save("T6", { taskId: "T6", ...r });
}

// --------------------------------------------------------------- exploratory
// Reported separately from every locked result, and never merged into one.
if (wanted("EXPLORE")) {
  log(`\n  EXPLORATORY  every V3 position touched in the window, all pools`);
  log(`  (outside the lock; reported apart from the locked T1 result)`);
  const wide = await scanAllPools(fromBlock, anchorBlock, (stage, done, total) =>
    process.stdout.write(`\r    ${stage} ${done}/${total}`.padEnd(48)),
  );
  process.stdout.write("\r".padEnd(48) + "\r");
  const pctOut = (wide.outOfRange / Math.max(wide.live, 1)) * 100;
  log(`    ${wide.positionsRead} positions touched · ${wide.live} live and priceable · ${wide.pools} pools`);
  log(`    out of range at the anchor block: ${wide.outOfRange} (${pctOut.toFixed(1)}%)`);
  log(`    past the ${DRIFT_TICKS}-tick trigger:  ${wide.pastTrigger} (${((wide.pastTrigger / Math.max(wide.live, 1)) * 100).toFixed(1)}%)`);
  for (const [fee, v] of Object.entries(wide.byFee).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    log(`      fee ${(Number(fee) / 10_000).toFixed(2)}%  ${v.out}/${v.live} out of range`);
  }
  save("EXPLORE", { scope: "exploratory, outside the input lock", anchorBlock: anchor.anchorBlock, ...wide });
}

log(`\n  rpc: ${stats.calls} calls, ${stats.retries} retries, ${stats.failures} exhausted\n`);
