/**
 * The input lock.
 *
 * An Agent Advantage Report that fixes its method after seeing the numbers is
 * marketing. This file fixes the method first: the task set, the exact inputs,
 * the scoring rubric, what the no-agent arm *is*, what counts as a loss, and
 * when to stop — all declared before a single measurement is taken.
 *
 * Two things make that claim checkable rather than asserted:
 *
 *   1. The spec below is deterministic. It reads nothing and depends on no
 *      clock, so `keccak256` of its canonical form is reproducible by anyone
 *      from this file alone.
 *
 *   2. That hash is written to BNB Smart Chain before the run, and the block
 *      it lands in *is* the anchor every task measures backward from. So the
 *      window cannot have been chosen to flatter the result: at the moment it
 *      was fixed, the result did not exist yet.
 *
 * The losses are in here too, named in advance. Deciding what would count as
 * the agent losing only after finding out whether it lost is the failure this
 * whole product exists to object to.
 */

import { keccak256, toHex } from "viem";

/** Blocks measured backward from the anchor. ~3 hours at BSC's 0.45s. */
export const WINDOW_BLOCKS = 24_000;

export interface TaskSpec {
  id: string;
  title: string;
  /** TermiX weights trading/stock/security; two tasks are security. */
  category: "Rebalancing" | "Grid" | "Yield" | "Health Factor" | "Security";
  /** What happens with no agent. Stated as a procedure, not a guess at a duration. */
  humanArm: string;
  agentArm: string;
  /** Fixed inputs. Addresses and sizes, never a range to be narrowed later. */
  inputs: Record<string, string | number>;
  metric: string;
  /** Declared before the run: what would count as the agent winning. */
  win: string;
  /** Declared before the run: what would count as the agent losing. */
  loss: string;
  /** Declared before the run: when the task must answer "I don't know". */
  inconclusive: string;
}

const POOL = "0x36696169C63e42cd08ce11f5deeBbCeBae652050";
const NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const REGISTRY = "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432";

export const TASKS: TaskSpec[] = [
  {
    id: "T1",
    title: "Keep a PancakeSwap V3 position in range",
    category: "Rebalancing",
    humanArm:
      "Do nothing until you happen to look. Measured on real BSC positions: of the live positions in this pool, how many sit outside their range at the anchor block, and how long they have been there.",
    agentArm:
      "src/agents/rebalance.ts, evaluated against each sampled position at the anchor block.",
    inputs: {
      pool: POOL,
      positionManager: NPM,
      poolFeeBps: 5,
      sampleSize: 120,
      windowBlocks: WINDOW_BLOCKS,
    },
    metric:
      "Share of sampled live positions out of range at the anchor block, and blocks elapsed since each left its range. A position out of range earns no fees, so this is idle capital measured directly rather than modelled.",
    win: "A materially large share of real positions are idle, and rebalance.ts flags each of them at the anchor block.",
    loss:
      "Positions that left their range and returned to it inside the window without their owner acting. For those, a re-centre would have paid gas and crystallised impermanent loss to no purpose, and the agent is worse than doing nothing. Counted and published.",
    inconclusive:
      "If no provider serves eth_getLogs over the window, the sample cannot be drawn and the task reports inconclusive rather than a smaller convenient sample.",
  },
  {
    id: "T2",
    title: "Run a grid ladder through the observed price path",
    category: "Grid",
    humanArm:
      "Buy and hold. This is not a stand-in for a human — it is the benchmark MandateMarket already settles every grid mandate against, so the agent is judged here exactly as it is judged in production.",
    agentArm: "src/agents/grid.ts, evaluated over the same path, gas charged at the measured price.",
    inputs: { pool: POOL, windowBlocks: WINDOW_BLOCKS, capitalBnb: 1, priceSource: "pool Swap events" },
    metric: "Net BNB-denominated return over the window, gas included, against holding.",
    win: "The grid ends the window ahead of holding after gas.",
    loss:
      "A trending window. A grid sells into strength and buys into weakness, so a directional move beats it and it should be published when it does.",
    inconclusive: "Fewer than 200 swaps recovered from the window; too thin a path to run a ladder over.",
  },
  {
    id: "T3",
    title: "Move stablecoin capital to the best Venus market",
    category: "Yield",
    humanArm:
      "Leave capital where it is. Definitional, not estimated: the no-agent arm of a rotation strategy is the absence of rotation.",
    agentArm: "src/agents/yield.ts, against live Venus supply rates at the anchor block.",
    inputs: { comptroller: COMPTROLLER, blocksPerYear: 63_072_000, capitalUsd: 1000 },
    metric:
      "Spread between the best and worst supply APY among listed Venus markets at the anchor block, and the capital at which one rotation's gas is repaid inside 30 days.",
    win: "A spread wide enough that rotation repays its gas well inside a month at ordinary capital.",
    loss:
      "A break-even capital high enough that at the sizes this market actually runs, the correct action is to do nothing. If so the agent's advantage here is zero and the report says zero.",
    inconclusive: "Venus markets unreadable at the anchor block.",
  },
  {
    id: "T4",
    title: "Repair a Venus position before it is liquidated",
    category: "Health Factor",
    humanArm:
      "The liquidation that actually happened. Venus publishes its own liquidation incentive on chain, so the cost of not acting is not an estimate — it is a protocol parameter, paid by every borrower who was too slow.",
    agentArm:
      "src/agents/health.ts, which triggers on headroom falling below a share of the borrow — strictly before a shortfall exists.",
    inputs: { comptroller: COMPTROLLER, windowBlocks: WINDOW_BLOCKS, markets: "vBNB, vUSDT, vBUSD" },
    metric:
      "Venus liquidationIncentiveMantissa and closeFactorMantissa at the anchor block, against the gas cost of one pre-emptive repayBorrow. Plus a count of real liquidations in the window where the logs can be read.",
    win: "The penalty for being late exceeds the cost of being early by a wide multiple.",
    loss:
      "Gas cost of pre-emptive repayment approaching the liquidation penalty, or a false-positive rate high enough that repeated repairs cost more than the one liquidation they avoid.",
    inconclusive: "Comptroller parameters unreadable; liquidation counts separately marked inconclusive if logs are refused.",
  },
  {
    id: "T5",
    title: "Decide which of 20 registry agents are safe to hire",
    category: "Security",
    humanArm:
      "Read the agent card and believe it. This is what the directory actually offers a person: a name, a description, a declared skill set, no evidence.",
    agentArm: "src/lib/assay — endpoint resolution, custody separation, transaction history, protocol contact.",
    inputs: { registry: REGISTRY, chainId: 56, sampleSize: 20, selection: "lowest 20 token ids returned for chain 56, recorded in the lock" },
    metric:
      "Count of sampled agents whose card claims a capability the chain contradicts, and wall-clock seconds for the assay arm.",
    win: "The assay contradicts a material number of cards — meaning a person trusting the directory would have hired something that cannot do the job.",
    loss:
      "Every inconclusive verdict. Where a provider refuses a log scan the assay cannot answer and a person with an explorer open can. Counted as a loss, not omitted.",
    inconclusive: "Registry unreachable, in which case no sample exists.",
  },
  {
    id: "T6",
    title: "Detect coordinated reputation on a registry agent",
    category: "Security",
    humanArm:
      "The reputation score the official explorer displays. Not a proxy for a human — it is the number a human is shown.",
    agentArm: "src/lib/sybil/detect — reviewer profiling, pairwise similarity, connected components.",
    inputs: { chainId: 56, feedbackPages: 30, pageSize: 100 },
    metric:
      "Displayed score against the score surviving de-duplication, plus the concentration behind it.",
    win: "The displayed score is materially inflated by a small number of wallets, and the agent arm says so with the evidence attached.",
    loss:
      "Flagging a wallet whose behaviour has an innocent reading, or a de-duplicated score that moves under a small change of threshold. Threshold sensitivity is published.",
    inconclusive: "8004scan rate limits below the page count above; a partial corpus is reported as partial.",
  },
];

export const RUBRIC = {
  time: "Wall-clock seconds for the agent arm, measured. The no-agent arm is never given an invented duration — where it has no natural duration the comparison is made on correctness or on cost, and the report says which.",
  cost: "Gas in BNB at the gas price read at the anchor block, plus API calls made. Reported per task.",
  quality:
    "A per-task criterion, fixed above in `metric`. No score is aggregated across tasks: a single headline number would hide exactly the losses this report exists to publish.",
  reporting:
    "Every task reports win, loss or inconclusive against the criteria declared above. Losses are set in bold. An all-wins report is evidence of a badly chosen task set, not of a good agent.",
};

export const BASELINE_DEFINITION = `The no-agent arm is never a guess at how long a person would take.

Every submission can assert "a human needs 45 minutes". None can show it. So
this report only uses baselines that are themselves observable:

  - what people on BSC demonstrably did, or did not do, with their own capital
    (T1, T4);
  - the benchmark the contract already settles against (T2);
  - the definitional absence of the action (T3);
  - the artifact a person is actually shown and would actually act on (T5, T6).

Where a task has no observable human arm, it is not in the report.`;

export const STOPPING_RULE = `One run, against the anchor block fixed by the lock transaction.

  - Inputs are exactly those above. No task is re-run with a different window,
    a different sample or a different threshold after its result is known.
  - A task that cannot be measured reports inconclusive. It is not dropped, and
    it is not retried until it produces a number.
  - A task that loses is published as a loss. The report is not re-cut to
    exclude it.
  - Nothing is added to the task set after the anchor block is known.`;

/** The deterministic part of the lock: everything a third party can recompute. */
export function specification() {
  return {
    version: 1,
    chainId: 56,
    windowBlocks: WINDOW_BLOCKS,
    anchorRule:
      "Every task measures the WINDOW_BLOCKS blocks ending at the block containing this lock's own transaction.",
    tasks: TASKS,
    rubric: RUBRIC,
    baselineDefinition: BASELINE_DEFINITION,
    stoppingRule: STOPPING_RULE,
  };
}

/**
 * Canonical JSON: keys sorted at every depth, so the digest depends on the
 * content and not on the order a JavaScript object happened to be built in.
 */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

/** The hash committed on chain before the run. */
export function specHash(): `0x${string}` {
  return keccak256(toHex(canonical(specification())));
}

export interface Anchor {
  specHash: `0x${string}`;
  /** The transaction carrying the hash. */
  txHash: `0x${string}`;
  /** The block it landed in. Every task measures backward from here. */
  anchorBlock: number;
  anchorTimestamp: number;
  fromBlock: number;
  gasPriceWei: string;
  lockedAt: string;
}
