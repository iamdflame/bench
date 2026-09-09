/**
 * The four jobs, in human language.
 *
 * The engine speaks in category slugs, "health-factor", "yield-optimisation".
 * A person arriving with no knowledge of Agent Studio speaks in jobs: protect a
 * loan, chase yield. This module is the translation layer between the two, and
 * the only place the marketing-facing phrasing lives. It is presentation, not
 * engine: it maps a short URL segment to a Category and carries the door label,
 * the one-line job, and the verb the activation flow speaks in.
 *
 * The four are surfaced at exactly equal weight everywhere, because Agent
 * Diversity is judged on the front door itself.
 */

import { CATEGORIES, type Category } from "@/lib/config";

export interface JobSpec {
  /** URL segment: /hire/<segment>. Short, human. */
  segment: string;
  category: Category;
  /** The door label on the hero. Imperative, plain. */
  door: string;
  /** One line under the door and atop the board. */
  job: string;
  /** The board's subtitle, what these agents actually do, on which venue. */
  board: string;
  /** The hero number's name for this job's board. */
  metric: string;
  /** What the agent is permitted to do, in plain words, for the leash screen. */
  may: string;
}

export const JOBS: JobSpec[] = [
  {
    segment: "rebalancing",
    category: "rebalancing",
    door: "Keep an LP in range",
    job: "Keep a liquidity position earning as the price moves.",
    board: "Agents that recenter a PancakeSwap V3 range when price drifts out of the band.",
    metric: "alpha over un-pooled hold",
    may: "withdraw, recenter and re-mint your V3 liquidity position",
  },
  {
    segment: "grid",
    category: "grid-trading",
    door: "Run a grid",
    job: "Trade a band automatically, buying dips and selling rips.",
    board: "Agents that place and manage grid orders within a band on PancakeSwap.",
    metric: "realized grid PnL",
    may: "swap within your band on the PancakeSwap router",
  },
  {
    segment: "yield",
    category: "yield-optimisation",
    door: "Chase yield",
    job: "Move idle capital to the best net rate, but only when it pays.",
    board: "Agents that route liquidity toward the highest available net yield on Venus/Aave.",
    metric: "net APY vs benchmark",
    may: "supply and redeem your capital on Venus / MasterChef",
  },
  {
    segment: "health",
    category: "health-factor",
    door: "Protect a loan",
    job: "Defend a loan from liquidation before it happens.",
    board: "Agents that defend a lending position's health factor on Venus/Aave.",
    metric: "health-factor defended",
    may: "repay your loan and supply collateral on Venus",
  },
];

export const jobBySegment = (segment: string): JobSpec | null =>
  JOBS.find((j) => j.segment === segment) ?? null;

export const jobByCategory = (category: Category): JobSpec =>
  JOBS.find((j) => j.category === category)!;

/**
 * The category index used by the on-chain book (a row's `category` is 0..3).
 *
 * The same source of truth as the engine's `CATEGORIES`, so the board's index
 * and the contract's index cannot drift apart.
 */
export const CATEGORY_ORDER: readonly Category[] = CATEGORIES;
