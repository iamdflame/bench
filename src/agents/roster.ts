/**
 * The lineup: eight first-party agents, two per category.
 *
 * This is what turns "we measure everyone" into "we also field the best-measured
 * agents." Each category has an aggressive primary and a conservative variant , 
 * the honest two ends of the same trade-off, and every one is a real, runnable,
 * dry-runnable `Strategy`.
 *
 * Deployment is stated, never faked. `wallet` is the mainnet account actually
 * running the agent; `null` means the strategy is built and dry-runs live but
 * has not been funded on its own wallet yet. An agent with no wallet has no
 * track record, and the board shows it exactly that way, the instrument does
 * not grade metal it has not been handed.
 */

import type { Address } from "viem";
import type { Category } from "@/lib/config";
import type { Strategy } from "./types";
import { HOUSE } from "@/lib/house";
import { rebalanceStrategy } from "./rebalance";
import { rebalanceConservativeStrategy } from "./rebalance2";
import { gridStrategy } from "./grid";
import { gridConservativeStrategy } from "./grid2";
import { yieldStrategy } from "./yield";
import { yieldConservativeStrategy } from "./yield2";
import { healthStrategy } from "./health";
import { healthConservativeStrategy } from "./health2";

const KEEPER_A = HOUSE.find((h) => h.slug === "keeper-a")?.wallet ?? null;
const KEEPER_B = HOUSE.find((h) => h.slug === "keeper-b")?.wallet ?? null;

export interface RosterAgent {
  slug: string;
  name: string;
  category: Category;
  /** I is the aggressive primary; II is the conservative variant. */
  tier: "I" | "II";
  strategy: Strategy;
  /** The mainnet wallet running it, or null when not yet deployed. */
  wallet: Address | null;
  /** A one-line note on what proof this agent is built to produce. */
  proof: string;
}

export const ROSTER: RosterAgent[] = [
  {
    slug: "range-keeper-i", name: "Range Keeper I", category: "rebalancing", tier: "I",
    strategy: rebalanceStrategy, wallet: KEEPER_A as Address | null,
    proof: "alpha vs un-pooled hold, per recentre, IL and gas crystallised and shown",
  },
  {
    slug: "range-keeper-ii", name: "Range Keeper II", category: "rebalancing", tier: "II",
    strategy: rebalanceConservativeStrategy, wallet: null,
    proof: "same benchmark, wider band, fewer recentres, less IL churn",
  },
  {
    slug: "grid-runner-i", name: "Grid Runner I", category: "grid-trading", tier: "I",
    strategy: gridStrategy, wallet: KEEPER_B as Address | null,
    proof: "realized grid PnL, fills, inventory, zero-price stress",
  },
  {
    slug: "grid-runner-ii", name: "Grid Runner II", category: "grid-trading", tier: "II",
    strategy: gridConservativeStrategy, wallet: null,
    proof: "same grid with trend and loss breakers, smaller drawdowns in a rout",
  },
  {
    slug: "yield-router-i", name: "Yield Router I", category: "yield-optimisation", tier: "I",
    strategy: yieldStrategy, wallet: KEEPER_A as Address | null,
    proof: "net APY captured vs benchmark, switching cost paid back in N days",
  },
  {
    slug: "yield-router-ii", name: "Yield Router II", category: "yield-optimisation", tier: "II",
    strategy: yieldConservativeStrategy, wallet: null,
    proof: "higher hysteresis, moves rarely, only on a spread worth being wrong about",
  },
  {
    slug: "health-shield-i", name: "Health Shield I", category: "health-factor", tier: "I",
    strategy: healthStrategy, wallet: KEEPER_A as Address | null,
    proof: "HF drills: fell to X, repaired to Y in Z seconds, tx-backed",
  },
  {
    slug: "health-shield-ii", name: "Health Shield II", category: "health-factor", tier: "II",
    strategy: healthConservativeStrategy, wallet: null,
    proof: "defends by adding collateral, keeps the loan the size the principal chose",
  },
];

export const rosterByCategory = (c: Category): RosterAgent[] => ROSTER.filter((r) => r.category === c);
export const rosterBySlug = (slug: string): RosterAgent | null => ROSTER.find((r) => r.slug === slug) ?? null;
