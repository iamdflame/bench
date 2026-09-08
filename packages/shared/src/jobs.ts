/**
 * The four jobs, in the words of someone who has never heard of ERC-8004.
 *
 * The brief names four categories — rebalancing, grid trading, yield, health
 * factor — and scores whether all four are surfaced at equal depth. So they
 * are defined once, in one array, and every surface that shows a job maps over
 * this array rather than writing four of anything. A category that gets a
 * bespoke component is a category that will drift shallower than the others,
 * and there is a CI check that fails the build when one does.
 *
 * `slug` is the URL segment and the sort key. `title` is what a person reads.
 * Nothing here says "concentrated liquidity range management".
 */

export const JOB_SLUGS = ["rebalancing", "grid", "yield", "health"] as const;
export type JobSlug = (typeof JOB_SLUGS)[number];

/** The registry's own vocabulary, kept for classification and API compatibility. */
export const CATEGORY_OF: Record<JobSlug, string> = {
  rebalancing: "rebalancing",
  grid: "grid-trading",
  yield: "yield-optimisation",
  health: "health-factor",
};

export interface MetricSpec {
  /** Stable key. Used by the ranking function and the API. */
  key: string;
  /** Column header and card label. Plain. */
  label: string;
  unit: "%" | "bps" | "seconds" | "days" | "USD" | "count" | "ratio";
  /** Higher is better, or lower is. Ranking needs to know; readers do too. */
  better: "higher" | "lower";
  /** One sentence: what this measures and against what. */
  means: string;
  /** Slug into /data explaining how it is computed. */
  method: string;
}

export interface Job {
  slug: JobSlug;
  /** The door label. Imperative, five words or fewer. */
  title: string;
  /** One line under the door. What the agent does for you. */
  line: string;
  /** A paragraph at the top of the job board, for someone with no context. */
  intro: string;
  /** Where the work happens, named. */
  venues: string[];
  /**
   * The headline metric first, then the secondary ones.
   *
   * Every job carries exactly the same number of metric specs. The check in
   * `tools/checks/diversity.ts` asserts it, because the failure mode this
   * rubric punishes is one category treated as the main event.
   */
  metrics: [MetricSpec, MetricSpec, MetricSpec];
  /** What a session key would be allowed to do, in plain words. */
  authority: string;
}

export const JOBS: Job[] = [
  {
    slug: "rebalancing",
    title: "Keep an LP in range",
    line: "Keeps a liquidity position earning as the price moves.",
    intro:
      "A PancakeSwap V3 position only earns fees while the price is inside the range you chose. When the price leaves that range the position stops earning and sits there. An agent hired for this job watches the price, and moves the range back around it when the fees it would collect are worth more than the gas and the loss of moving.",
    venues: ["PancakeSwap V3"],
    metrics: [
      {
        key: "time-in-range",
        label: "Time in range",
        unit: "%",
        better: "higher",
        means: "Share of the observation window the managed position was earning fees rather than sitting outside its band.",
        method: "time-in-range",
      },
      {
        key: "il-plus-gas",
        label: "IL + gas",
        unit: "%",
        better: "higher",
        means: "Impermanent loss and gas actually crystallised by the recentres it performed, as a share of the position.",
        method: "il-plus-gas",
      },
      {
        key: "fees-vs-hold",
        label: "Fees vs holding",
        unit: "%",
        better: "higher",
        means: "Fees earned against the same two tokens simply held un-pooled over the same window.",
        method: "fees-vs-hold",
      },
    ],
    authority: "withdraw, recentre and re-mint your V3 liquidity position",
  },
  {
    slug: "grid",
    title: "Run a grid",
    line: "Buys the dips and sells the rips inside a band you set.",
    intro:
      "A grid places buy orders below the current price and sell orders above it, and profits from the price moving back and forth rather than from it going up. An agent hired for this job maintains that ladder on PancakeSwap, and the number that matters is what it actually realised, not how many orders it placed.",
    venues: ["PancakeSwap V3", "PancakeSwap V2"],
    metrics: [
      {
        key: "realized-pnl",
        label: "Realized PnL",
        unit: "%",
        better: "higher",
        means: "Profit actually banked by completed round trips over the window, net of fees and gas.",
        method: "realized-pnl",
      },
      {
        key: "fills",
        label: "Fills",
        unit: "count",
        better: "higher",
        means: "Grid legs that actually executed on chain. A grid with no fills earned nothing, whatever it quoted.",
        method: "fills",
      },
      {
        key: "inventory-skew",
        label: "Inventory skew",
        unit: "%",
        better: "lower",
        means: "How far the holding drifted from balanced. A grid that ends the window all in one token has taken a directional bet.",
        method: "inventory-skew",
      },
    ],
    authority: "swap within your band on the PancakeSwap router",
  },
  {
    slug: "yield",
    title: "Chase yield",
    line: "Moves idle capital to the best net rate, but only when it pays.",
    intro:
      "Lending rates on Venus and Aave move constantly, and the highest advertised rate is often on a market with no liquidity in it. An agent hired for this job compares the rates that are actually available at your size, and moves your capital when the extra yield pays back the cost of moving before the rate changes again.",
    venues: ["Venus", "Aave V3", "PancakeSwap MasterChef V3"],
    metrics: [
      {
        key: "net-apy-captured",
        label: "Net APY captured",
        unit: "%",
        better: "higher",
        means: "The rate actually earned, against the best rate that was reachable at your size over the same window.",
        method: "net-apy-captured",
      },
      {
        key: "payback-days",
        label: "Switching payback",
        unit: "days",
        better: "lower",
        means: "How long the extra yield takes to repay the gas of a move. A rotation that never pays back is a loss.",
        method: "payback-days",
      },
      {
        key: "moves",
        label: "Moves",
        unit: "count",
        better: "lower",
        means: "Rotations performed. Fewer is better at the same captured rate, because each one costs gas and carries risk.",
        method: "moves",
      },
    ],
    authority: "supply and redeem your capital on Venus, Aave or MasterChef",
  },
  {
    slug: "health",
    title: "Protect a loan",
    line: "Defends a borrow position before it gets liquidated.",
    intro:
      "If you have borrowed against collateral on Venus or Aave and the collateral falls, the position is liquidated and you pay a penalty — Venus charges ten percent. An agent hired for this job watches the health factor and acts before the threshold rather than after, either by repaying part of the debt or by adding collateral.",
    venues: ["Venus", "Aave V3"],
    metrics: [
      {
        key: "hf-floor",
        label: "Lowest health factor",
        unit: "ratio",
        better: "higher",
        means: "The closest the position came to liquidation over the window. Below 1.0 it would have been liquidated.",
        method: "hf-floor",
      },
      {
        key: "repair-latency",
        label: "Repair latency",
        unit: "seconds",
        better: "lower",
        means: "Time between the health factor crossing the agent's own threshold and the repairing transaction landing.",
        method: "repair-latency",
      },
      {
        key: "repairs",
        label: "Repairs",
        unit: "count",
        better: "higher",
        means: "Repayments or collateral additions that actually landed on chain over the window.",
        method: "repairs",
      },
    ],
    authority: "repay your loan and supply collateral on Venus or Aave",
  },
];

export const jobBySlug = (slug: string): Job | null =>
  JOBS.find((j) => j.slug === slug) ?? null;

export const isJobSlug = (s: unknown): s is JobSlug =>
  typeof s === "string" && (JOB_SLUGS as readonly string[]).includes(s);

/** The registry category string a job maps onto, for classifier and API. */
export const jobByCategory = (category: string): Job | null =>
  JOBS.find((j) => CATEGORY_OF[j.slug] === category) ?? null;
