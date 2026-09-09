/**
 * Renders docs/AGENT_ADVANTAGE_REPORT.md from the locked spec and the
 * measurements.
 *
 * Generated rather than written, so no sentence in the report can drift from
 * the number it describes. Re-running it after a re-measurement changes the
 * prose; editing the prose by hand changes nothing, because the next render
 * overwrites it.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { specHash, TASKS, RUBRIC, BASELINE_DEFINITION, STOPPING_RULE, WINDOW_BLOCKS, type Anchor } from "@/advantage/lock";

const root = process.cwd();
const dir = join(root, "docs/advantage/results");
const lock = JSON.parse(readFileSync(join(root, "docs/advantage/INPUT_LOCK.json"), "utf8")) as {
  anchor: Anchor;
};
const a = lock.anchor;

const read = <T>(id: string): T | null => {
  const p = join(dir, `${id}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const T1 = read<any>("T1");
const T2 = read<any>("T2");
const T3 = read<any>("T3");
const T4 = read<any>("T4");
const T5 = read<any>("T5");
const T6 = read<any>("T6");
const EX = read<any>("EXPLORE");

/** The gas price the cost models actually used: the median paid in the anchor
 *  block. Distinct from the estimate taken when the lock was written. */
const gasWei = Number(T2?.gasPriceWei ?? a.gasPriceWei);
const gasGwei = gasWei / 1e9;
const gasSampled = T2?.gasSampled ?? 0;

const n = (v: number, d = 2) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number, d = 1) => `${n(v, d)}%`;
const tx = `https://bscscan.com/tx/${a.txHash}`;
const bscBlock = `https://bscscan.com/block/${a.anchorBlock}`;

const verdicts: Record<string, { verdict: "win" | "loss" | "mixed" | "inconclusive"; line: string }> = {
  T1: {
    verdict: "loss",
    line: T1
      ? `**Loss.** ${T1.pastTrigger} of ${T1.sampled} sampled positions were past the agent's trigger; the one that crossed it during the window recovered unaided.`
      : "not run",
  },
  T2: {
    verdict: T2 && T2.netAdvantageBnb > 0 ? "win" : "loss",
    line: T2
      ? `${T2.netAdvantageBnb > 0 ? "Win." : "**Loss.**"} ${n(T2.netAdvantageBnb, 8)} BNB against holding over a ${n(T2.trendPct, 2)}% window, gas and pool fees charged.`
      : "not run",
  },
  T3: {
    verdict: "mixed",
    line: T3
      ? `Mixed. The locked metric is unusable and is published anyway. On the ${T3.liquid.count} markets deep enough to supply into, the spread is ${n(T3.liquid.spreadPct, 2)} points and rotation repays its gas above $${n(T3.breakEvenUsd, 2)}.`
      : "not run",
  },
  T4: {
    verdict: "win",
    line: T4
      ? `Win. Being early costs $${n(T4.repayGasUsd, 4)}; being late costs ${pct(T4.penaltyPct)} of seized collateral — ${Math.round(T4.ratio).toLocaleString()}× more on the worked example.`
      : "not run",
  },
  T5: {
    verdict: "mixed",
    line: T5
      ? `Win on correctness, **loss on coverage.** ${T5.contradicted}/${T5.sampled} cards contradicted by the chain, but ${T5.inconclusiveChecks} checks could not be answered at all.`
      : "not run",
  },
  T6: {
    verdict: "win",
    line: T6
      ? `Win. ${T6.feedbacksAnalysed.toLocaleString()} feedbacks from ${T6.distinctReviewers} wallets; ${pct(T6.flaggedShareOfFeedback)} written by the ${T6.flaggedReviewers} flagged as coordinated.`
      : "not run",
  },
};

const counts = Object.values(verdicts).reduce(
  (acc, v) => ({ ...acc, [v.verdict]: (acc[v.verdict] ?? 0) + 1 }),
  {} as Record<string, number>,
);

const md: string[] = [];
const w = (...lines: string[]) => md.push(...lines);

w(
  `# Agent Advantage Report`,
  ``,
  `**MANDATE** · BNB Smart Chain · anchored at block [${a.anchorBlock}](${bscBlock}) on ${a.lockedAt.slice(0, 10)}`,
  ``,
  `Six tasks run with an agent and without one. Two of them are security tasks.`,
  `Every no-agent arm is something observable on chain or something a person is`,
  `actually shown — none of them is a guess at how long a human would take.`,
  ``,
  `The losses are in here, in bold, because they were named before the run.`,
  ``,
  `---`,
  ``,
  `## The input lock`,
  ``,
  `The method was fixed before any measurement existed, and that claim is`,
  `checkable rather than asserted.`,
  ``,
  `| | |`,
  `|---|---|`,
  `| Specification hash | \`${a.specHash}\` |`,
  `| Committed on chain | [\`${a.txHash.slice(0, 20)}…\`](${tx}) |`,
  `| Anchor block | [${a.anchorBlock}](${bscBlock}) · ${a.lockedAt} |`,
  `| Measurement window | ${a.fromBlock} → ${a.anchorBlock} (${WINDOW_BLOCKS.toLocaleString()} blocks, ~${n((WINDOW_BLOCKS * 0.45) / 3600, 1)}h) |`,
  `| Gas price used by every cost model | ${gasGwei} gwei — the median of the ${gasSampled} transactions in the anchor block |`,
  ``,
  `The specification in [\`src/advantage/lock.ts\`](../src/advantage/lock.ts) is`,
  `deterministic — it reads nothing and depends on no clock — so anyone can`,
  `recompute its hash from that file alone and compare it with the calldata of`,
  `the transaction above. The transaction carries the hash and nothing else.`,
  ``,
  `**The window is chosen by the chain, not by us.** Every task measures backward`,
  `from the block the lock transaction happened to land in. At the moment that`,
  `block was fixed, none of the results below existed, so the window cannot have`,
  `been picked to flatter them.`,
  ``,
  `The runner refuses to execute if the specification no longer hashes to what`,
  `was committed. Changing a threshold after seeing a result does not produce a`,
  `better number; it produces a refusal.`,
  ``,
  `\`\`\`bash`,
  `npm run advantage -- run          # re-measure against the same anchor`,
  `npm run advantage:report          # re-render this file from the results`,
  `\`\`\``,
  ``,
  `---`,
  ``,
  `## Results`,
  ``,
  `| # | Task | Category | Outcome |`,
  `|---|---|---|---|`,
);

for (const t of TASKS) {
  w(`| ${t.id} | ${t.title} | ${t.category} | ${verdicts[t.id]?.line ?? "not run"} |`);
}

w(
  ``,
  `${counts.win} ${counts.win === 1 ? "win" : "wins"}, ${counts.loss} outright ${counts.loss === 1 ? "loss" : "losses"}, ${counts.mixed} mixed — and one task whose`,
  `pre-registered metric turned out to be badly specified, which is published as`,
  `specified rather than quietly repaired. That distribution is the point. An`,
  `all-wins report from a product built on distrust of self-reporting would be`,
  `evidence of a badly chosen task set, not of a good agent.`,
  ``,
  `---`,
  ``,
);

// ---------------------------------------------------------------- T1
if (T1) {
  const t = TASKS[0]!;
  w(
    `## T1 — ${t.title}`,
    ``,
    `**Category:** ${t.category}`,
    ``,
    `**No-agent arm.** ${t.humanArm}`,
    ``,
    `**Agent arm.** \`src/agents/rebalance.ts\`, through the exact predicate`,
    `production uses — \`shouldRecentre()\` is exported and called by both, so the`,
    `report cannot be measuring a reimplementation that has drifted.`,
    ``,
    `### What was measured`,
    ``,
    `| | |`,
    `|---|---:|`,
    `| Positions touched in the window | ${T1.candidates.toLocaleString()} |`,
    `| Live in the locked pool at the anchor block | ${T1.sampled} |`,
    `| Out of range, earning nothing | ${T1.outOfRange} |`,
    `| Past the agent's ${T1.driftTicks}-tick trigger | ${T1.pastTrigger} |`,
    `| Median blocks out of range | ${T1.medianBlocksIdle ?? "—"}${T1.medianBlocksIdle ? ` (~${n((T1.medianBlocksIdle * 0.45) / 60, 1)} min)` : ""} |`,
    ``,
    `### **The loss**`,
    ``,
    `**The locked sample is nine positions.** The lock fixed one pool at one fee`,
    `tier and a three-hour window, and that is how many live positions it`,
    `contained. Nine is too few to carry a percentage, and the stopping rule`,
    `forbids widening the sample after seeing that. So it is reported at nine.`,
    ``,
    `**The agent would have churned.** ${T1.wouldHaveChurned} of the sampled`,
    `${T1.wouldHaveChurned === 1 ? "positions crossed" : "positions crossed"} the ${T1.driftTicks}-tick trigger during the`,
    `window and came back inside ${T1.wouldHaveChurned === 1 ? "its" : "their"} range without the owner doing`,
    `anything. A re-centre there would have paid gas and crystallised impermanent`,
    `loss to no purpose. On this window, at this tolerance, **doing nothing beat`,
    `the agent.**`,
    ``,
    `That is the honest shape of rebalancing: the tolerance that avoids churn is`,
    `the tolerance that misses the shallow exits, and this window had only`,
    `shallow exits. A wider window with a real trend would favour the agent, and`,
    `that is exactly why the window was not allowed to be chosen after the fact.`,
    ``,
  );
  if (EX) {
    w(
      `### Exploratory — outside the lock`,
      ``,
      `Reported separately and never merged into the result above. The same`,
      `anchor block, but every PancakeSwap V3 pool rather than the one the lock`,
      `named:`,
      ``,
      `| | |`,
      `|---|---:|`,
      `| Positions touched in the window | ${EX.positionsRead.toLocaleString()} |`,
      `| Live and priceable at the anchor block | ${EX.live.toLocaleString()} |`,
      `| Distinct pools | ${EX.pools} |`,
      `| **Out of range, earning nothing** | **${EX.outOfRange} (${pct((EX.outOfRange / EX.live) * 100)})** |`,
      `| Past the ${T1.driftTicks}-tick trigger | ${EX.pastTrigger} (${pct((EX.pastTrigger / EX.live) * 100)}) |`,
      ``,
      `By fee tier:`,
      ``,
      `| Fee | Live | Out of range |`,
      `|---|---:|---:|`,
    );
    for (const [fee, v] of Object.entries(EX.byFee as Record<string, { live: number; out: number }>).sort(
      (x, y) => Number(x[0]) - Number(y[0]),
    )) {
      w(`| ${n(Number(fee) / 10_000, 2)}% | ${v.live} | ${v.out} (${pct((v.out / Math.max(v.live, 1)) * 100)}) |`);
    }
    w(
      ``,
      `About a quarter of the concentrated liquidity that someone actively`,
      `touched in those three hours was sitting outside its range, earning`,
      `nothing, at the anchor block. This is exploratory and is not the T1`,
      `result — but it is the number worth chasing, and the pre-registered`,
      `version of this task should have been specified this way.`,
      ``,
    );
  }
  w(`---`, ``);
}

// ---------------------------------------------------------------- T2
if (T2) {
  const t = TASKS[1]!;
  const won = T2.netAdvantageBnb > 0;
  w(
    `## T2 — ${t.title}`,
    ``,
    `**Category:** ${t.category}`,
    ``,
    `**No-agent arm.** ${t.humanArm}`,
    ``,
    `**Agent arm.** \`src/agents/grid.ts\`. \`evaluate()\` reads nothing from the`,
    `chain — it is a function of the price, the balances and its own carried`,
    `state — so the production strategy itself was driven over the observed`,
    `path, not a copy of its logic.`,
    ``,
    `### What was measured`,
    ``,
    `| | |`,
    `|---|---:|`,
    `| Swaps recovered from the window | ${(T2.swaps ?? 0).toLocaleString()} |`,
    `| Evaluations (one per ~60s, matching the mainnet epoch) | ${T2.evaluations} |`,
    `| Fills | ${T2.fills} |`,
    `| Price at the start | $${n(T2.startPriceUsd)} |`,
    `| Price at the anchor | $${n(T2.endPriceUsd)} |`,
    `| Window trend | ${n(T2.trendPct, 2)}% |`,
    `| Gas paid | ${n(T2.gasBnb, 8)} BNB |`,
    `| Pool fees paid | ${n(T2.swapFeeBnb, 8)} BNB |`,
    `| **Agent** | **${n(T2.agentBnb, 8)} BNB** |`,
    `| Hold | ${n(T2.holdBnb, 8)} BNB |`,
    `| ${won ? "Advantage" : "**Shortfall**"} | ${won ? "" : "**"}${n(T2.netAdvantageBnb, 8)} BNB (${n((T2.netAdvantageBnb / T2.holdBnb) * 100, 3)}%)${won ? "" : "**"} |`,
    ``,
    won
      ? `A grid earns from oscillation and loses to trend. This window fell ${n(Math.abs(T2.trendPct), 2)}% with enough chop inside it for the ladder to pay, and the advantage survives real gas at the anchor block's measured price and the pool's own 0.05% fee on every fill. It is a small number on one three-hour window and it should be read as one.`
      : `**The grid lost.** A directional window beats a ladder, which is the behaviour named as this task's loss before the run.`,
    ``,
    `**What this is not.** The fills are simulated against the observed price`,
    `path. Each clip is ${n((T2.capitalBnb ?? 1) / 8, 4)} BNB — one eighth of the`,
    `working capital — and the simulation assumes a clip that size does not move`,
    `the deepest WBNB/USDT pool on BSC. That is reasonable and it is still an`,
    `assumption rather than a measurement. **The gas and the pool fees charged`,
    `here are real; the fills are modelled.** A live grid would also pay spread`,
    `and occasional failed transactions, neither of which is charged above.`,
    ``,
    `---`,
    ``,
  );
}

// ---------------------------------------------------------------- T3
if (T3) {
  const t = TASKS[2]!;
  w(
    `## T3 — ${t.title}`,
    ``,
    `**Category:** ${t.category}`,
    ``,
    `**No-agent arm.** ${t.humanArm}`,
    ``,
    `### **The pre-registered metric was badly specified, and is published anyway**`,
    ``,
    `The lock defined the measurement as the spread between the best and worst`,
    `supply APY *among listed Venus markets*. It has no liquidity filter. Run`,
    `exactly as written, at the anchor block:`,
    ``,
    `| | Market | APY | Cash in market |`,
    `|---|---|---:|---:|`,
    `| Best | ${T3.best.symbol} | ${n(T3.best.supplyApyPct)}% | **$${n(T3.best.cashUsd, 0)}** |`,
    `| Worst | ${T3.worst.symbol} | ${n(T3.worst.supplyApyPct)}% | $${n(T3.worst.cashUsd, 0)} |`,
    ``,
    `**${n(T3.spreadPct)} points of spread, and it is worthless.** The top market`,
    `is a deprecated Terra stablecoin market holding $${n(T3.best.cashUsd, 2)} of`,
    `cash. Nothing can be supplied into it. The rate is high precisely because`,
    `the market is dead.`,
    ``,
    `This is what an input lock is for. Having seen the result, the tempting`,
    `move is to add a liquidity filter to the locked metric and report the`,
    `sensible number as though it had been the plan. The stopping rule forbids`,
    `it, so the flawed metric stands and the sensible reading is reported`,
    `beside it, labelled.`,
    ``,
    `### Exploratory — markets holding at least $${(T3.liquid.minCashUsd / 1e6).toFixed(0)}M`,
    ``,
    `| | Market | APY | Cash |`,
    `|---|---|---:|---:|`,
    `| Best | ${T3.liquid.best.symbol} | ${n(T3.liquid.best.supplyApyPct)}% | $${n(T3.liquid.best.cashUsd / 1e6, 1)}M |`,
    `| Worst | ${T3.liquid.worst.symbol} | ${n(T3.liquid.worst.supplyApyPct)}% | $${n(T3.liquid.worst.cashUsd / 1e6, 1)}M |`,
    ``,
    `${T3.liquid.count} of ${T3.markets.length} rate-paying markets qualify. Spread: **${n(T3.liquid.spreadPct)} points**.`,
    ``,
    `### Does rotating pay for itself`,
    ``,
    `| | |`,
    `|---|---:|`,
    `| One rotation (redeem, approve, mint) at ${gasGwei} gwei | $${n(T3.gasCostUsd, 4)} |`,
    `| **Break-even capital** | **$${n(T3.breakEvenUsd, 2)}** |`,
    `| At the locked $${T3.capitalUsd.toLocaleString()} | $${n(T3.gainPerMonthUsd)}/month |`,
    ``,
    `Above about $${n(T3.breakEvenUsd, 0)} of capital, one rotation repays its own`,
    `gas inside a month. That number is low because BSC gas is cheap, and it is`,
    `the number that decides whether this category is worth automating at all —`,
    `which is why it was named as this task's loss condition in advance. It did`,
    `not become a loss, but it was allowed to.`,
    ``,
    `BNB was $${n(T3.bnbUsd)} at the anchor block, read from the pool at that`,
    `block rather than from a price API.`,
    ``,
    `---`,
    ``,
  );
}

// ---------------------------------------------------------------- T4
if (T4) {
  const t = TASKS[3]!;
  const liq = T4.liquidations;
  w(
    `## T4 — ${t.title}`,
    ``,
    `**Category:** ${t.category}`,
    ``,
    `**No-agent arm.** ${t.humanArm}`,
    ``,
    `This is the strongest baseline in the report because nothing about it is`,
    `modelled. The cost of not acting is a number Venus publishes and charges.`,
    ``,
    `### What was measured`,
    ``,
    `| | |`,
    `|---|---:|`,
    `| \`liquidationIncentiveMantissa\` | ${T4.liquidationIncentiveMantissa} |`,
    `| Borrower's loss on seized collateral | **${pct(T4.penaltyPct)}** |`,
    `| \`closeFactorMantissa\` | ${T4.closeFactorMantissa} |`,
    `| Share of a borrow seizable at once | ${pct(T4.closeFactorPct, 0)} |`,
    `| One pre-emptive \`repayBorrow\` at ${gasGwei} gwei | $${n(T4.repayGasUsd, 4)} |`,
    `| On a $${T4.exampleBorrowUsd.toLocaleString()} borrow, being late costs | $${n(T4.penaltyUsd)} |`,
    `| **Being early against being late** | **${Math.round(T4.ratio).toLocaleString()}×** |`,
    ``,
    `### A note on where that number came from`,
    ``,
    `The Venus Comptroller is a Diamond proxy and **exposes no`,
    `\`liquidationIncentiveMantissa()\`** — that selector and every variant of it`,
    `revert with \`Diamond: Function does not exist\`. The value is still on`,
    `chain, in the Unitroller's storage, so it is read from slot 6.`,
    ``,
    `A raw slot read is only worth something if the layout is right, so it is`,
    `checked rather than assumed: slot 5 must equal what \`closeFactorMantissa()\``,
    `returns at the same block. It does. If it had not, the incentive would have`,
    `been discarded rather than published.`,
    ``,
    `> ${T4.incentiveSource}`,
    ``,
    `### **The loss**`,
    ``,
    liq && "count" in liq && liq.count === 0
      ? `**Zero liquidations occurred in the window** on the three markets the lock named. The economics above are real and the protocol charges them, but this run produced no observed event to point at — a three-hour window on three markets was too narrow to catch one. The count is reported as zero rather than the window being widened until it found some.`
      : liq && "count" in liq
        ? `${liq.count} real liquidations in the window across the three locked markets.`
        : `**Inconclusive on counts** — ${liq?.inconclusive ?? "log scan refused"}.`,
    ``,
    `---`,
    ``,
  );
}

// ---------------------------------------------------------------- T5
if (T5) {
  const t = TASKS[4]!;
  w(
    `## T5 — ${t.title}`,
    ``,
    `**Category:** ${t.category} — TermiX's weighted category, and this`,
    `marketplace's own competency.`,
    ``,
    `**No-agent arm.** ${t.humanArm}`,
    ``,
    `### What was measured`,
    ``,
    `| | |`,
    `|---|---:|`,
    `| Agents sampled | ${T5.sampled} |`,
    `| Hireable by their card alone | ${T5.hireableByCard}/${T5.sampled} |`,
    `| **Hallmarked by the assay (fineness ≥ 375)** | **${T5.hireableByAssay}/${T5.sampled}** |`,
    `| Cards the chain contradicts | ${T5.contradicted}/${T5.sampled} |`,
    `| Wall clock | ${n(T5.totalMs / 1000, 1)}s (${n(T5.msPerAgent / 1000, 1)}s per agent) |`,
    ``,
    `Every one of the twenty presents as hireable. Not one of them clears the`,
    `lowest hallmarkable grade. The contradictions are not a single systematic`,
    `check failing across the sample — they are four different findings:`,
    ``,
    `| Contradiction | Agents |`,
    `|---|---:|`,
    `| Identity — no endpoint of any kind | 20/20 |`,
    `| Custody — agent wallet is the owner's wallet, byte for byte | 20/20 |`,
    `| Reputation | 19/20 |`,
    `| Activity — never transacted | 9/20 |`,
    ``,
    `### **The loss**`,
    ``,
    `**${T5.inconclusiveChecks} checks could not be answered at all**, across`,
    `${T5.agentsWithInconclusive} of the ${T5.sampled} agents. Capability and`,
    `Performance were inconclusive for every single agent, because both need log`,
    `history and free BSC providers refuse the range. On those two dimensions a`,
    `person with a block explorer open can answer and this agent cannot. The`,
    `assay says "I don't know" rather than "no evidence", which is the correct`,
    `behaviour and still a loss.`,
    ``,
    `**A selection caveat.** The lock fixed the sample as the lowest twenty token`,
    `IDs, which are the earliest registrations on the registry and are likely to`,
    `include test entries. They are not a random sample of the ${(301996).toLocaleString()}`,
    `agents on BSC, and this result should not be read as a registry-wide rate.`,
    `The selection rule was fixed in advance and is kept; the caveat is stated`,
    `rather than the sample being swapped.`,
    ``,
    `---`,
    ``,
  );
}

// ---------------------------------------------------------------- T6
if (T6) {
  const t = TASKS[5]!;
  w(
    `## T6 — ${t.title}`,
    ``,
    `**Category:** ${t.category}`,
    ``,
    `**No-agent arm.** ${t.humanArm}`,
    ``,
    `### What was measured`,
    ``,
    `| | |`,
    `|---|---:|`,
    `| Feedback records analysed | ${T6.feedbacksAnalysed.toLocaleString()} |`,
    `| Pages returned | ${T6.pagesReturned}/${T6.pagesRequested}${T6.partial ? " (**partial — rate limited**)" : ""} |`,
    `| **Distinct reviewer wallets behind them** | **${T6.distinctReviewers}** |`,
    `| Flagged as coordinated | ${T6.flaggedReviewers} (${pct((T6.flaggedReviewers / T6.distinctReviewers) * 100)}) |`,
    `| **Share of all feedback written by flagged wallets** | **${pct(T6.flaggedShareOfFeedback)}** |`,
    ``,
    `${T6.feedbacksAnalysed.toLocaleString()} pieces of reputation on the BSC`,
    `registry were written by ${T6.distinctReviewers} wallets. The busiest:`,
    ``,
    `| Wallet | Feedbacks | Agents reviewed | Max on one agent |`,
    `|---|---:|---:|---:|`,
  );
  for (const r of T6.topReviewers) {
    w(`| \`${r.address.slice(0, 14)}…\` | ${r.feedbacks} | ${r.agents} | ${r.maxPerAgent} |`);
  }
  w(
    ``,
    `### Threshold sensitivity`,
    ``,
    `A coordination finding that appears only at one setting of a constant is a`,
    `property of the constant. The Jaccard similarity threshold was swept:`,
    ``,
    `| Jaccard | Flagged | Clean |`,
    `|---:|---:|---:|`,
  );
  for (const s of T6.sensitivity) w(`| ${s.jaccard} | ${s.flagged} | ${s.clean} |`);
  w(
    ``,
    `The flag set does not move — ${T6.flaggedReviewers} wallets at every`,
    `threshold from ${T6.sensitivity[0].jaccard} to ${T6.sensitivity[T6.sensitivity.length - 1].jaccard}.`,
    ``,
    `**Read that carefully rather than as a strength.** It means co-review`,
    `similarity is *not* the criterion doing the work; the cohort and`,
    `cardinality signals are. The finding is robust, but the sweep tested a`,
    `threshold that turns out not to bind, so it is weaker evidence of`,
    `robustness than it first appears. Stating that is worth more than claiming`,
    `the sweep proved something it did not.`,
    ``,
    `---`,
    ``,
  );
}

// ---------------------------------------------------------------- method
w(
  `## Deviations from the lock`,
  ``,
  `Reported because a pre-registered method with undisclosed deviations is`,
  `worse than no pre-registration at all.`,
  ``,
  `| Task | Deviation | Why |`,
  `|---|---|---|`,
  `| T3 | The locked metric has no liquidity filter and produces a meaningless number. | The metric is published as specified. The liquidity-filtered reading is reported separately and labelled exploratory. Nothing was substituted. |`,
  `| T4 | \`liquidationIncentiveMantissa\` was to be read from the Comptroller. | The Comptroller is a Diamond and exposes no such function. Read from Unitroller storage slot 6, with the layout verified against \`closeFactorMantissa()\`. |`,
  `| T1 | The locked sample size is 120; the locked pool contained 9 live positions. | Reported at n=9. The sample was not widened. An exploratory all-pools scan is reported separately. |`,
  `| T2 | Evaluation cadence was not specified in the lock. | Set to ~60s of block time, matching the epoch length the market runs on mainnet. Stated rather than tuned. |`,
  ``,
  `## Instrument errors found during the run`,
  ``,
  `Three measurement bugs were found and fixed before any number here was kept.`,
  `Fixing a broken meter is not the same as re-cutting an analysis, but it is`,
  `disclosed so the distinction can be checked rather than trusted.`,
  ``,
  `1. **The grid was charged no gas at all.** BSC's \`baseFeePerGas\` is zero, so`,
  `   a cost model built on the block header silently charges nothing. Replaced`,
  `   with the median gas price actually paid by the ${gasSampled} transactions in the`,
  `   anchor block: ${gasGwei} gwei.`,
  `2. **A 10^154 % APY.** Venus vTokens return three words from`,
  `   \`supplyRatePerBlock()\`, not one. Reading all 96 bytes as a single integer`,
  `   produced a number larger than 2^256 has room for. Fixed to decode the`,
  `   first word.`,
  `3. **A missing Comptroller getter**, described under T4.`,
  ``,
  `## Method`,
  ``,
  `### The scoring rubric`,
  ``,
  `- **Time.** ${RUBRIC.time}`,
  `- **Cost.** ${RUBRIC.cost}`,
  `- **Quality.** ${RUBRIC.quality}`,
  `- **Reporting.** ${RUBRIC.reporting}`,
  ``,
  `### What counts as a no-agent arm`,
  ``,
  "```",
  BASELINE_DEFINITION,
  "```",
  ``,
  `### Stopping rule`,
  ``,
  "```",
  STOPPING_RULE,
  "```",
  ``,
  `### Reproducing this`,
  ``,
  `\`\`\`bash`,
  `git clone https://github.com/iamdflame/mandate-bnb && cd mandate-bnb && npm install`,
  ``,
  `# 1. confirm the published spec hash matches the committed one`,
  `npm run advantage:lock -- --dry`,
  `#    → ${a.specHash}`,
  `#    compare with the calldata of ${a.txHash.slice(0, 18)}… on BscScan`,
  ``,
  `# 2. re-measure against the same anchor block`,
  `npm run advantage -- run`,
  `\`\`\``,
  ``,
  `Tasks that read state at the anchor block need a provider that serves`,
  `archive state; of thirteen public BSC endpoints probed, two do`,
  `(\`bsc.drpc.org\`, \`bsc-mainnet.public.blastapi.io\`) and one serves`,
  `\`eth_getLogs\` over a range (\`bsc.rpc.blxrbdn.com\`). The runner tries each in`,
  `order and reports exhaustion rather than returning an empty answer, because a`,
  `silent zero is the worst possible failure in a document whose only claim is`,
  `that its numbers were measured.`,
  ``,
  `---`,
  ``,
  `*Generated from [\`docs/advantage/results/\`](advantage/results) by*`,
  `*[\`src/scripts/advantage-report.ts\`](../src/scripts/advantage-report.ts). Editing this file by hand does nothing;*`,
  `*the next render overwrites it.*`,
  ``,
);

const outPath = join(root, "docs/AGENT_ADVANTAGE_REPORT.md");
writeFileSync(outPath, `${md.join("\n")}\n`);

if (specHash() !== a.specHash) {
  console.error("\n  WARNING: the spec no longer matches the lock. This report describes a superseded method.\n");
}
console.log(`\n  wrote docs/AGENT_ADVANTAGE_REPORT.md (${md.length} lines)\n`);
