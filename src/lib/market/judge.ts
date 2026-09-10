/**
 * The walk for somebody who has no wallet.
 *
 * A judge with a phone and ninety seconds cannot install a wallet, fund it and
 * sign. The competition solves this on testnet, where the money is imaginary.
 * This solves it on mainnet by paying for them out of an account we control,
 * for the four agents that will actually answer.
 *
 * What sponsorship can and cannot be here is set by what the wallet holds, and
 * the page says so rather than promising four free calls and running dry on
 * the second. Everything sponsored is capped, logged and refuses outside the
 * four agents named below.
 */

import type { Category } from "@/lib/config";
import { listings, type Listing } from "@/lib/market/listing";

export interface JudgePick {
  category: Category;
  listing: Listing;
  /** Why this one and not another in the same category. */
  because: string;
}

/**
 * One agent per category, chosen by measurement rather than by preference.
 *
 * The rule is fixed and stated: the fastest third-party agent that answered
 * when we last called it. First-party reference agents are excluded, because a
 * walk that ends on our own agent proves we can call ourselves.
 */
export function judgePicks(hires?: Map<string, number>): JudgePick[] {
  const all = listings(hires);
  const out: JudgePick[] = [];
  const categories: Category[] = [
    "rebalancing",
    "grid-trading",
    "yield-optimisation",
    "health-factor",
  ];

  for (const category of categories) {
    const live = all
      .filter((l) => l.category === category && l.liveness === "live")
      .sort((a, b) => (a.probe?.latencyMs ?? 1e9) - (b.probe?.latencyMs ?? 1e9));
    const priced = live.find((l) => l.quote);
    const pick = priced ?? live[0];
    if (!pick) continue;
    out.push({
      category,
      listing: pick,
      because: priced
        ? `the quickest agent in this category that answered and publishes a price (${pick.probe?.latencyMs} ms)`
        : `the quickest agent in this category that answered when we called it (${pick.probe?.latencyMs} ms)`,
    });
  }
  return out;
}
