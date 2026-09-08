/**
 * What a strategy is, and why it has to be this shape.
 *
 * The counterfactual asks a question no directory can answer: *what would this
 * agent have done to your position, in dollars, over the last thirty days?*
 * That is only answerable if a strategy is a **pure function of chain state** —
 * given the world at block N and whatever the strategy remembered from block
 * N-1, it proposes actions and nothing else. Feed it history instead of the
 * head and it replays.
 *
 * The important word is *proposes*. `decide` returns actions; it does not send
 * them. A strategy that could send a transaction could not be replayed, because
 * replaying it would move real money. Purity here is not an aesthetic
 * preference, it is what makes the whole feature possible.
 *
 * ---------------------------------------------------------------------------
 * No lookahead, structurally
 * ---------------------------------------------------------------------------
 *
 * The single easiest way to produce a flattering counterfactual is to let the
 * strategy see the future — one peek at tomorrow's price and any strategy beats
 * any benchmark. So the observation handed to `decide` carries exactly one
 * price point, the one at its own block, rather than a series it could index
 * into. There is no `history` field to accidentally read past the cursor,
 * because the type does not have one.
 *
 * `tools/checks/no-lookahead.ts` proves the property rather than trusting the
 * shape: it replays a strategy, mutates every tick after the decision block,
 * replays again, and fails the build if any decision changed.
 */

import type { Address } from "viem";

/**
 * One observation of a V3 pool, at one block.
 *
 * It carries the swap's amounts and the pool's active liquidity as well as the
 * price, because fees cannot otherwise be *computed*. A position in range earns
 *
 *     fee × |amount traded| × (its liquidity ÷ the pool's active liquidity)
 *
 * and every term on the right is in the `Swap` event. Without `amount` and
 * `liquidity` a replay would have to assume a fee yield, and an assumed yield
 * is the one number that would make every counterfactual here worthless.
 */
export interface Tick {
  block: bigint;
  /** Unix seconds, read from the block header. */
  timestamp: number;
  /** The pool's tick after the swap that produced this observation. */
  tick: number;
  /** √P · 2^96, the exact price. Kept alongside `tick` because rounding differs. */
  sqrtPriceX96: bigint;
  /** Signed token0 delta for the pool. Positive means token0 came in. */
  amount0: bigint;
  /** Signed token1 delta for the pool. */
  amount1: bigint;
  /** The pool's in-range liquidity at this swap. The denominator of any fee share. */
  liquidity: bigint;
}

/** A concentrated-liquidity position, as the simulation carries it. */
export interface Position {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  /** Fees earned and not yet withdrawn, in the pool's two tokens. */
  owed0: bigint;
  owed1: bigint;
}

/** What a strategy may propose. Deliberately small. */
export type Action =
  | {
      kind: "recentre";
      /** The new band. The simulator burns the old position and mints this one. */
      tickLower: number;
      tickUpper: number;
      why: string;
    }
  | { kind: "collect"; why: string }
  | { kind: "hold"; why: string };

/**
 * Everything a strategy is allowed to see.
 *
 * One block, one price, one position, and whatever it chose to remember. No
 * series, no future, no wallet, no signer.
 */
export interface Observation<S = unknown> {
  chainId: number;
  pool: Address;
  /** The pool's fee in hundredths of a bip, e.g. 500 for 0.05%. */
  feePips: number;
  at: Tick;
  position: Position;
  /** Whatever this strategy returned as `state` last time. */
  state: S | null;
}

/** A decision: what to do, and what to remember. */
export interface Decision<S = unknown> {
  actions: Action[];
  state: S | null;
  /** One sentence, for the reproduce log. Not used in any calculation. */
  note?: string;
}

/**
 * A strategy, as the replay engine sees it.
 *
 * `decide` is synchronous on purpose. An async strategy could reach the network
 * mid-replay and read the present while pretending to be in the past, and the
 * type system is a cheaper guard against that than a code review.
 */
export interface Strategy<S = unknown> {
  slug: string;
  name: string;
  /** What it does, for the reproduce log and the agent page. */
  describes: string;
  decide(o: Observation<S>): Decision<S>;
}

/** Why a window is shorter than it was asked to be, or null when it is not. */
export type WindowNote = string | null;

/** The price series a replay runs over, with its own honesty attached. */
export interface History {
  chainId: number;
  pool: Address;
  feePips: number;
  token0: Address;
  token1: Address;
  ticks: Tick[];
  fromBlock: bigint;
  toBlock: bigint;
  /** False when any range could not be read. Never treat as "nothing happened". */
  complete: boolean;
  /** Set when the window shrank, saying by how much and why. */
  shortenedBecause: WindowNote;
  /** Which host served it, for the reproduce line. */
  via: string | null;
}
