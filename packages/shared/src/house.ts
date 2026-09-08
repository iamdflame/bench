/**
 * The eight reference agents, two per job.
 *
 * They exist for three reasons, in this order: to guarantee every category
 * board has depth on judging day, to give a buyer something to hire when the
 * third-party supply for a job is thin, and to prove the three rails work end
 * to end against something we control before we point them at a stranger.
 *
 * They are **reference implementations against a published listing spec**, not
 * the product. Two rules keep them from quietly becoming the product:
 *
 *   1. **Ranking never privileges them.** If a third-party agent measures
 *      better on a job's headline metric, it ranks above ours. That is
 *      enforced in the ranking function, unit-tested, and stated on /data.
 *
 *   2. **Anything we did to make ours listable, any operator can do.** The
 *      listing spec is public and `/list` is self-serve, including over MCP so
 *      an agent can list itself.
 *
 * ---------------------------------------------------------------------------
 * Deployment is stated, never implied
 * ---------------------------------------------------------------------------
 *
 * `wallet` is the mainnet account actually running the agent, and `null` means
 * the strategy is built and dry-runs live but has not been funded on its own
 * wallet. `tokenId` is its ERC-8004 registration, and `null` means it is not
 * registered — not that a number is reserved. An agent with no wallet has no
 * track record and the board shows it exactly that way: the instrument does
 * not grade metal it has not been handed.
 *
 * Their endpoints are served by this same application, which is the honest
 * arrangement rather than a shortcut: the Rail 1 challenge and the Rail 2
 * quote are real, they are answered by code in this repository, and a buyer
 * pays the same way they would pay anyone else.
 */

import type { Address } from "viem";
import { known } from "@bench/measure";
import type { Agent } from "./domain";
import type { JobSlug } from "./jobs";
import type { SupportedChain } from "./chains";
import { IDENTITY_REGISTRY } from "./addresses";

export interface HouseAgent {
  slug: string;
  name: string;
  job: JobSlug;
  /** I is the primary; II is the conservative variant of the same trade-off. */
  tier: "I" | "II";
  description: string;
  /** What proof this agent is built to produce, in one line. */
  proof: string;
  /** The mainnet wallet running it, or null when not yet funded. */
  wallet: Address | null;
  /** Its ERC-8004 registration, or null when not yet registered. */
  tokenId: string | null;
  /** Price of one Rail 1 call, in raw USD1 units (18 decimals). */
  callPrice: bigint;
  /** Price of one Rail 2 job, in raw $U units (18 decimals). */
  hirePrice: bigint;
}

const env = (k: string): Address | null => {
  const v = process.env[k] ?? "";
  return /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : null;
};

const CENT = 10_000_000_000_000_000n; // 0.01 in 18 decimals
const HALF = 500_000_000_000_000_000n; // 0.50 in 18 decimals

export const HOUSE_AGENTS: HouseAgent[] = [
  {
    slug: "range-keeper-i",
    name: "Range Keeper I",
    job: "rebalancing",
    tier: "I",
    description:
      "Keeps a PancakeSwap V3 position earning as the price moves. It recentres the range when price leaves the band, and does nothing when the fees it would collect would not cover the gas and the loss of moving.",
    proof: "Time in range; impermanent loss and gas crystallised per recentre; fees against an un-pooled hold.",
    wallet: env("HOUSE_RANGE_I"),
    tokenId: process.env.HOUSE_RANGE_I_TOKEN ?? null,
    callPrice: CENT,
    hirePrice: HALF,
  },
  {
    slug: "range-keeper-ii",
    name: "Range Keeper II",
    job: "rebalancing",
    tier: "II",
    description:
      "The same job with a wider band and a higher bar for moving. It recentres less often, crystallises less loss, and accepts more time near the edge of the range in exchange.",
    proof: "Same benchmark as Range Keeper I, fewer recentres, less churn.",
    wallet: env("HOUSE_RANGE_II"),
    tokenId: process.env.HOUSE_RANGE_II_TOKEN ?? null,
    callPrice: CENT,
    hirePrice: HALF,
  },
  {
    slug: "grid-runner-i",
    name: "Grid Runner I",
    job: "grid",
    tier: "I",
    description:
      "Maintains a ladder of buy and sell orders inside a band on PancakeSwap, taking the spread as the price moves back and forth. It is capped per leg and stops if the band breaks.",
    proof: "Realized profit from completed round trips; fills; how far inventory drifted from balanced.",
    wallet: env("HOUSE_GRID_I"),
    tokenId: process.env.HOUSE_GRID_I_TOKEN ?? null,
    callPrice: CENT,
    hirePrice: HALF,
  },
  {
    slug: "grid-runner-ii",
    name: "Grid Runner II",
    job: "grid",
    tier: "II",
    description:
      "The same ladder with a trend brake and a loss brake: it stops adding to a side the price is running away from, and stops entirely after a drawdown you set.",
    proof: "Realized profit with the brakes engaged, and the trades it declined to make.",
    wallet: env("HOUSE_GRID_II"),
    tokenId: process.env.HOUSE_GRID_II_TOKEN ?? null,
    callPrice: CENT,
    hirePrice: HALF,
  },
  {
    slug: "yield-router-i",
    name: "Yield Router I",
    job: "yield",
    tier: "I",
    description:
      "Compares the net rate actually reachable at your size across Venus, Aave and MasterChef, and moves capital when the extra yield pays back the gas before the rate is likely to change.",
    proof: "Net rate captured against the best reachable; how many days each move took to pay for itself.",
    wallet: env("HOUSE_YIELD_I"),
    tokenId: process.env.HOUSE_YIELD_I_TOKEN ?? null,
    callPrice: CENT,
    hirePrice: HALF,
  },
  {
    slug: "yield-router-ii",
    name: "Yield Router II",
    job: "yield",
    tier: "II",
    description:
      "The same comparison with a much higher bar for acting. It moves only on a durable gap, which costs some captured yield and avoids paying gas to chase a rate that reverts in an hour.",
    proof: "Net rate captured with high hysteresis, and the rotations it declined.",
    wallet: env("HOUSE_YIELD_II"),
    tokenId: process.env.HOUSE_YIELD_II_TOKEN ?? null,
    callPrice: CENT,
    hirePrice: HALF,
  },
  {
    slug: "health-shield-i",
    name: "Health Shield I",
    job: "health",
    tier: "I",
    description:
      "Watches a Venus borrow position and repays part of the debt before the health factor reaches the threshold you set, rather than after. Venus charges a ten percent liquidation penalty; a pre-emptive repayment costs gas.",
    proof: "The lowest health factor reached; the gap between crossing the threshold and the repair landing.",
    wallet: env("HOUSE_HEALTH_I"),
    tokenId: process.env.HOUSE_HEALTH_I_TOKEN ?? null,
    callPrice: CENT,
    hirePrice: HALF,
  },
  {
    slug: "health-shield-ii",
    name: "Health Shield II",
    job: "health",
    tier: "II",
    description:
      "The same watch, defending with collateral instead of repayment. It keeps the borrow intact and raises the denominator, which suits a position you do not want to unwind.",
    proof: "The lowest health factor reached, defended without reducing the loan.",
    wallet: env("HOUSE_HEALTH_II"),
    tokenId: process.env.HOUSE_HEALTH_II_TOKEN ?? null,
    callPrice: CENT,
    hirePrice: HALF,
  },
];

export const houseBySlug = (slug: string) => HOUSE_AGENTS.find((h) => h.slug === slug) ?? null;

export const houseByTokenId = (tokenId: string) =>
  HOUSE_AGENTS.find((h) => h.tokenId === tokenId) ?? null;

/** Our own site's origin, where the reference agents answer. */
export const houseOrigin = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "https://bench-bnb.vercel.app").replace(/\/+$/, "");

export const houseEndpoint = (slug: string) => `${houseOrigin()}/api/agents/${slug}`;

/**
 * Mark our own rows, so the board can label them and the ranking check can
 * assert we never outrank a better third party.
 *
 * A house agent that is not registered on chain does not appear as a registry
 * row at all — it appears through `houseRows` below, with its deployment
 * state stated. Reserving a token id it does not hold would be exactly the
 * kind of claim this product refuses.
 */
export function applyHouse(agents: Agent[]): Agent[] {
  return agents.map((a) => {
    const h = houseByTokenId(a.tokenId);
    return h ? { ...a, isOurs: true, name: h.name, description: h.description } : a;
  });
}

/**
 * The reference agents as board rows, whether or not they are registered.
 *
 * An unregistered one still has a live endpoint, a real price and a real
 * strategy, so it is listable — it simply has no ERC-8004 identity, and the
 * row says that rather than inventing one.
 */
export function houseRows(chainId: SupportedChain): Agent[] {
  return HOUSE_AGENTS.map((h) => ({
    chainId,
    tokenId: h.tokenId ?? `house:${h.slug}`,
    registry: IDENTITY_REGISTRY[chainId],
    owner: h.wallet,
    agentWallet: h.wallet,
    name: h.name,
    description: h.description,
    endpoint: houseEndpoint(h.slug),
    job: known(h.job),
    jobEvidence: ["operated by BENCH as a reference implementation for this job"],
    rails: {
      call: { available: false as const, reason: "not-probed" as const },
      hire: { available: false as const, reason: "not-probed" as const },
      mandate: h.wallet
        ? ({ available: false as const, reason: "not-probed" as const })
        : ({
            available: false as const,
            reason: "no-wallet" as const,
            detail: "This reference agent is not funded on its own mainnet wallet yet, so there is no account to scope a session over.",
          }),
    },
    probe: null,
    originHost: new URL(houseOrigin()).host,
    originCohortSize: HOUSE_AGENTS.length,
    track: [],
    reputation: {
      known: false as const,
      reason: "We do not publish reputation for our own agents. Their track record is the measurement, and it is read from chain.",
    },
    isOurs: true,
    sources: ["chain" as const],
    updatedAt: new Date().toISOString(),
  }));
}
