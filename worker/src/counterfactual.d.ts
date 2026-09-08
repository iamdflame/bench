/**
 * Replay the reference strategies against a real pool, on a schedule.
 *
 * A thirty-day window is about 1,152 log requests. That is a batch job, not a
 * request path — a hire screen that spends four minutes walking history is a
 * hire screen that times out — so this runs in the worker and the site reads
 * what it wrote.
 *
 * ---------------------------------------------------------------------------
 * What this is honest about
 * ---------------------------------------------------------------------------
 *
 * The opening position is **synthetic**: a stated amount of capital in a stated
 * band, opened at the first observed price. It is not anybody's real position,
 * and the record says so in a field the page renders rather than in a comment
 * nobody reads. Replaying against a viewer's own position is the next step and
 * needs a connected wallet; until then this answers "what would these agents
 * have done to a position like this", which is a smaller claim, honestly made.
 *
 * The window is whatever the archive host actually served. If it hit the wall
 * part way, `shortenedBecause` carries the sentence and the days are counted
 * from the blocks that were read, never from the blocks that were asked for.
 */
import { type SupportedChain } from "@bench/shared";
import { type Address } from "viem";
/** One strategy's outcome, in the shape the page renders. */
export interface CounterfactualRow {
    /** Matches a house agent's slug where one exists, so a row can find itself. */
    strategy: string;
    name: string;
    describes: string;
    timeInRangePercent: number;
    recentres: number;
    /** Gas charged across the window, in the pool's token0 units. */
    gasCost: string;
    /** Net change against the opening position, in token0 units. Negative is a loss. */
    net: string;
    /** The same figure against the do-nothing arm. This is the number that matters. */
    vsHold: string;
}
export interface CounterfactualRecord {
    chainId: number;
    pool: Address;
    pair: string;
    feePips: number;
    token0Symbol: string;
    fromBlock: string;
    toBlock: string;
    hours: number;
    swaps: number;
    complete: boolean;
    shortenedBecause: string | null;
    via: string | null;
    gasPriceWei: string;
    /** Said plainly, because the page shows it: this is not anyone's real position. */
    positionNote: string;
    bandHalfWidthTicks: number;
    rows: CounterfactualRow[];
    observedAt: string;
    reproduce: string;
    /** Set when the position would be large enough to move the pool it is measured in. */
    dilution: string | null;
}
/**
 * Run every reference strategy over one pool's recent history.
 *
 * `days` is what is asked for; what comes back may be less, and the record says
 * which. `capital` is in token0 units — for a USDT-quoted pool that is dollars.
 */
export declare function runCounterfactual(chainId: SupportedChain, opts?: {
    poolIndex?: number;
    days?: number;
    capital?: bigint;
    halfWidth?: number;
    /**
     * End the window this many blocks before the head.
     *
     * A published window that runs to the head cannot be graded until enough
     * new chain accumulates, which for a one-day window is hours of waiting.
     * Ending it earlier leaves a real, disjoint successor window to grade
     * against immediately — and the successor is still something the replay
     * never saw, which is the only property the test actually needs.
     */
    endBlocksAgo?: bigint;
}): Promise<CounterfactualRecord | null>;
//# sourceMappingURL=counterfactual.d.ts.map