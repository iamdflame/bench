/**
 * Reference strategies, written to be replayed.
 *
 * These exist to make the engine testable against something whose behaviour is
 * knowable in advance, and to give the board a second and third column so a
 * comparison is not a single agent talking to itself. They are deliberately
 * simple: the point of the counterfactual is the measurement, not the alpha.
 *
 * Each is a pure function of one observation plus its own memory. None of them
 * can reach the network, the future, or a wallet — see `types.ts`.
 *
 * **Tight Band exists to lose.** A strategy that recentres on the smallest
 * provocation keeps a position in range almost always and pays gas for the
 * privilege, and on a quiet pool that is a net loss. Publishing an agent that
 * loses, at the same weight as the ones that win, is what makes the winners
 * believable — plan rule 5.5.5. If every strategy in this file made money, the
 * file would be marketing.
 */

import type { Observation, Decision, Strategy } from "./types";

/** How far the price may drift outside the band before a keeper reacts. */
interface KeeperState {
  /** Observations since the last recentre. Throttles thrash on a jittery pool. */
  since: number;
}

const TICK_SPACING = 10;

/** Round a tick to the pool's spacing, which a mint would do anyway. */
const align = (tick: number): number => Math.round(tick / TICK_SPACING) * TICK_SPACING;

/**
 * A band-keeper, parameterised by how wide it sits and how patient it is.
 *
 * `halfWidth` is in ticks either side of the price. `patience` is the number of
 * observations it will tolerate being out of range before it moves — the whole
 * difference between a keeper that earns and one that donates to the gas market
 * is in that number.
 */
function keeper(params: {
  slug: string;
  name: string;
  describes: string;
  halfWidth: number;
  patience: number;
}): Strategy<KeeperState> {
  const { slug, name, describes, halfWidth, patience } = params;
  return {
    slug,
    name,
    describes,
    decide(o: Observation<KeeperState>): Decision<KeeperState> {
      const state: KeeperState = { since: (o.state?.since ?? 0) + 1 };
      const { tick } = o.at;
      const inside = tick >= o.position.tickLower && tick <= o.position.tickUpper;

      if (inside) return { actions: [{ kind: "hold", why: "The price is inside the band." }], state };

      if (state.since < patience) {
        return {
          actions: [
            {
              kind: "hold",
              why: `Out of range, but only for ${state.since} observation${state.since === 1 ? "" : "s"}. Moving now would pay gas for noise.`,
            },
          ],
          state,
        };
      }

      return {
        actions: [
          {
            kind: "recentre",
            tickLower: align(tick - halfWidth),
            tickUpper: align(tick + halfWidth),
            why: `Price left the band and stayed out for ${state.since} observations. Recentring ±${halfWidth} ticks on ${tick}.`,
          },
        ],
        state: { since: 0 },
      };
    },
  };
}

/** Wide and patient. Earns less per unit of capital, pays gas rarely. */
export const rangeKeeperI = keeper({
  slug: "range-keeper-i",
  name: "Range Keeper I",
  describes:
    "Keeps a wide band around the price and only moves when the price has stayed outside it. Trades fee density for fewer, cheaper interventions.",
  halfWidth: 600,
  patience: 40,
});

/** Narrower, still patient. The middle of the three. */
export const rangeKeeperII = keeper({
  slug: "range-keeper-ii",
  name: "Range Keeper II",
  describes:
    "A tighter band than Range Keeper I, moved when the price has been outside it for a while. More fee density, more recentres.",
  halfWidth: 250,
  patience: 20,
});

/**
 * Tight and impatient. Almost always in range, and pays for it.
 *
 * Kept and published precisely because it usually loses.
 */
export const tightBandKeeper = keeper({
  slug: "tight-band-keeper",
  name: "Tight Band Keeper",
  describes:
    "Holds a narrow band and recentres almost as soon as the price leaves it. Maximises time in range and pays gas for every move — often more than the extra fees are worth.",
  halfWidth: 80,
  patience: 2,
});

/**
 * The do-nothing arm: hold the position exactly as it was found.
 *
 * This is the benchmark for rebalancing and it is not a straw man — an
 * un-touched position still earns fees whenever the price wanders back through
 * its band, and it never pays gas. Plenty of real agents fail to beat it.
 */
export const holdPosition: Strategy<null> = {
  slug: "hold",
  name: "Hold",
  describes: "Does nothing at all. The honest do-nothing arm every other row has to beat.",
  decide: () => ({ actions: [{ kind: "hold", why: "Holding." }], state: null }),
};

export const REFERENCE_STRATEGIES = [
  rangeKeeperI,
  rangeKeeperII,
  tightBandKeeper,
] as const;
