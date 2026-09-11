/**
 * The four picks on /judges: one third-party agent per category.
 *
 * The rule is fixed and stated: the fastest agent in the category that
 * answered when we last called it, preferring one that publishes a price.
 * Agents we operate are excluded by token and by owner; they appear beside the
 * picks as reference agents, labelled as ours. We do not pay for the picks'
 * calls from this page.
 */

import type { Category } from "@/lib/config";
import { listings, type Listing } from "@/lib/market/listing";
import { HOUSE, REFERENCE, referenceRegistrations } from "@/lib/house";
import { DEMO_ADDRESS } from "@/lib/demo";

/**
 * Every token and owner we control. The picks are "somebody else's agent that
 * answered", so none of these may ever be one: Mandate's own registration,
 * the two keeper wallets, the four reference agents and the keys behind them.
 */
function ours(): { tokens: Set<string>; owners: Set<string> } {
  const regs = referenceRegistrations();
  const tokens = new Set<string>(["336161", ...HOUSE.map((h) => h.tokenId).filter((t): t is string => Boolean(t)), ...REFERENCE.map((r) => regs[r.slug]?.tokenId).filter((t): t is string => Boolean(t))]);
  const owners = new Set<string>(
    [
      DEMO_ADDRESS,
      ...HOUSE.map((h) => h.wallet),
      ...REFERENCE.map((r) => regs[r.slug]?.owner).filter((o): o is `0x${string}` => Boolean(o)),
      "0x6F29B50ebaF733D980EadfeB3253347d8a12A69C",
    ].map((a) => a.toLowerCase()),
  );
  return { tokens, owners };
}

export const isOurs = (l: Pick<Listing, "tokenId"> & { owner?: string | null }): boolean => {
  const o = ours();
  return o.tokens.has(l.tokenId) || Boolean(l.owner && o.owners.has(l.owner.toLowerCase()));
};

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
      .filter((l) => l.category === category && l.liveness === "live" && !isOurs(l as Listing & { owner?: string | null }))
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
