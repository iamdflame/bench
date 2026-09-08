/**
 * Rail 3 — Mandate. Standing authority, derived from evidence.
 *
 * This is the rail that hands an agent a key, and it is therefore the one that
 * needs a rule stronger than good intentions. The rule is:
 *
 *     granted = the job's canonical calls  ∩  the venues the chain shows it using
 *
 * and it holds **by construction**, because the allowlist is built from the
 * capability scan rather than checked against it afterwards. An agent that
 * calls itself a rebalancer and has never touched the position manager is
 * granted nothing, and is told exactly that.
 *
 * The invariant is enforced by the type system rather than by an assertion
 * somebody can forget to call. `ProvenScope` carries a symbol this module does
 * not export, so no code outside this file can construct one, and the grant
 * function accepts nothing else. A grant that has not been through a
 * capability scan does not compile.
 *
 * Refusal is the default when evidence is *unknown*, not only when it is
 * absent. An incomplete scan proves nothing, and a provider timing out must
 * never become a silent denial wearing the costume of a policy decision.
 *
 * ---------------------------------------------------------------------------
 * The recipient problem, and the contract that closes it
 * ---------------------------------------------------------------------------
 *
 * A session key binds a target and four selector bytes. It cannot bind an
 * argument. PancakeSwap's position manager takes `recipient` as an argument on
 * `mint` and `collect`, so granting those selectors grants them with any
 * destination the agent chooses. The operator of the largest agent shop on
 * this chain published exactly this about their own product: custody rests on
 * account isolation rather than recipient binding.
 *
 * So the grant is not issued on the position manager. It is issued on
 * `RecipientBound`, whose `mint` and `collect` have no recipient parameter at
 * all — the destination is written from immutable storage. There is nothing to
 * pass, because the argument is not in the interface.
 */

import type { CallPermission, SessionPermissions } from "@altananetwork/sdk";
import type { Address } from "viem";
import {
  VENUES,
  VENUE_LABEL,
  recipientBound,
  type JobSlug,
  type SupportedChain,
} from "@bench/shared";
import { scanCapability, type CapabilityScan } from "@bench/probe";

/**
 * Unexported. This is what makes a `ProvenScope` unforgeable outside this file.
 *
 * It must be a *real* symbol, not a `declare const`. A declared const exists
 * only in the type system, so `{ [witness]: … }` type-checked and then threw
 * `ReferenceError: witness is not defined` the first time a scope was actually
 * derived — the brand compiled and the rail could not run. A `const` symbol
 * gives the same compile-time guarantee (nothing outside this module can name
 * it, so nothing outside can build a `ProvenScope` without an explicit cast)
 * and also exists at runtime, which is where the grant happens.
 */
const witness: unique symbol = Symbol("bench.provenScope") as never;

/** One clause of the leash, in both machine and human form. */
export interface AllowedCall {
  to: Address;
  target: string;
  signature: string;
  /** What it does, for a person reading the hire screen. */
  plain: string;
  /**
   * Where value goes, and what pins it there.
   *
   * Null when the call moves nothing outward. Present and specific when it
   * does — this is the field the whole document exists for.
   */
  recipient: { boundTo: "you"; by: "wrapper" | "session-key"; note: string } | null;
}

export interface WithheldCall {
  signature: string;
  /** Why it is deliberately absent. A leash is defined by what it withholds. */
  because: string;
}

export interface ProvenScope {
  readonly [witness]: "derived from a capability scan";
  chainId: SupportedChain;
  agent: Address;
  job: JobSlug;
  /** Exactly what the session will allow. Never wider than what was proven. */
  calls: AllowedCall[];
  /** Calls the job permits that this agent has not earned. */
  withheld: WithheldCall[];
  /** Venue addresses the chain showed it using. */
  proven: string[];
  /** The scan behind all of it, for the evidence drawer. */
  scan: CapabilityScan;
  /** One sentence naming the derivation, recorded with the grant. */
  rationale: string;
}

export interface ScopeRefused {
  refused: true;
  reason: string;
  /** What would have to become true for a grant to be possible. */
  remedy: string;
  scan: CapabilityScan | null;
}

export const isRefused = (s: ProvenScope | ScopeRefused): s is ScopeRefused =>
  (s as ScopeRefused).refused === true;

/**
 * The canonical calls for each job, before intersection.
 *
 * Enumerated per selector rather than per contract, deliberately. An agent
 * permitted to swap through a router must not thereby be permitted to call
 * `sweepToken` on it, and the only way to say that in a session grant is to
 * name the four bytes you mean.
 */
interface JobCall {
  venue: string;
  to: Address;
  signature: string;
  plain: string;
  /** True when the call carries a destination argument the wrapper must bind. */
  needsRecipientBinding?: boolean;
}

const JOB_CALLS: Record<JobSlug, JobCall[]> = {
  rebalancing: [
    {
      venue: VENUES.pancakeV3PositionManager,
      to: VENUES.pancakeV3PositionManager as Address,
      signature: "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))",
      plain: "Open a new liquidity range for you",
      needsRecipientBinding: true,
    },
    {
      venue: VENUES.pancakeV3PositionManager,
      to: VENUES.pancakeV3PositionManager as Address,
      signature: "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))",
      plain: "Add to a position you already own",
    },
    {
      venue: VENUES.pancakeV3PositionManager,
      to: VENUES.pancakeV3PositionManager as Address,
      signature: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))",
      plain: "Withdraw liquidity from your position",
    },
    {
      venue: VENUES.pancakeV3PositionManager,
      to: VENUES.pancakeV3PositionManager as Address,
      signature: "collect((uint256,address,uint128,uint128))",
      plain: "Collect the fees your position earned",
      needsRecipientBinding: true,
    },
  ],
  grid: [
    {
      venue: VENUES.pancakeV3Router,
      to: VENUES.pancakeV3Router as Address,
      signature: "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
      plain: "Swap one token for the other inside your band",
      needsRecipientBinding: true,
    },
    {
      venue: VENUES.pancakeV3Router,
      to: VENUES.pancakeV3Router as Address,
      signature: "exactInput((bytes,address,uint256,uint256))",
      plain: "Swap along a route inside your band",
      needsRecipientBinding: true,
    },
  ],
  yield: [
    {
      venue: VENUES.pancakeMasterChefV3,
      to: VENUES.pancakeMasterChefV3 as Address,
      signature: "harvest(uint256,address)",
      plain: "Harvest farming rewards to you",
      needsRecipientBinding: true,
    },
    { venue: VENUES.venusVBNB, to: VENUES.venusVBNB as Address, signature: "mint()", plain: "Supply BNB to Venus" },
    {
      venue: VENUES.venusVBNB,
      to: VENUES.venusVBNB as Address,
      signature: "redeemUnderlying(uint256)",
      plain: "Withdraw your supplied BNB from Venus",
    },
    {
      venue: VENUES.venusVUSDT,
      to: VENUES.venusVUSDT as Address,
      signature: "mint(uint256)",
      plain: "Supply USDT to Venus",
    },
  ],
  health: [
    {
      venue: VENUES.venusVBNB,
      to: VENUES.venusVBNB as Address,
      signature: "repayBorrow()",
      plain: "Repay part of your BNB loan to lift the health factor",
    },
    {
      venue: VENUES.venusVUSDT,
      to: VENUES.venusVUSDT as Address,
      signature: "repayBorrow(uint256)",
      plain: "Repay part of your USDT loan",
    },
    {
      venue: VENUES.venusVBNB,
      to: VENUES.venusVBNB as Address,
      signature: "mint()",
      plain: "Add BNB as collateral instead of repaying",
    },
    {
      venue: VENUES.venusVUSDT,
      to: VENUES.venusVUSDT as Address,
      signature: "mint(uint256)",
      plain: "Add USDT as collateral",
    },
  ],
};

/**
 * What every grant deliberately withholds, and why.
 *
 * A reader cannot infer an absence from a list of presences, so the absences
 * are written down. Each of these is a real selector on a contract this
 * marketplace grants calls on, and each is one an agent could use to move your
 * money somewhere you did not choose.
 */
export const ALWAYS_WITHHELD: WithheldCall[] = [
  { signature: "sweepToken(address,uint256,address)", because: "It sends any token balance to an address the agent picks." },
  { signature: "refundETH()", because: "It moves native value out on a path the grant cannot see." },
  { signature: "unwrapWETH9(uint256,address)", because: "It unwraps and forwards to an address the agent picks." },
  { signature: "multicall(bytes[])", because: "It lets an agent compose calls the allowlist never approved individually." },
  { signature: "approve(address,uint256)", because: "It would let the agent authorise a third party to spend your tokens." },
  { signature: "transferFrom(address,address,uint256)", because: "It moves your tokens directly." },
  { signature: "setApprovalForAll(address,bool)", because: "It would hand your whole position collection to another contract." },
  { signature: "borrow(uint256)", because: "This marketplace does not grant the authority to take on debt in your name." },
];

/**
 * Derive the authority an agent has actually earned.
 *
 * The order is the argument: scan first, intersect second, and never the other
 * way round. Nothing in this function can widen a grant, because the only
 * calls it can return are those whose venue appears in the scan.
 */
export async function scopeFor(
  chainId: SupportedChain,
  agent: Address,
  job: JobSlug,
  opts: {
    lookback?: bigint;
    /**
     * A scan already taken, to derive from instead of running a new one.
     *
     * A capability scan reads hundreds of thousands of blocks of logs and
     * takes minutes against free providers — far too slow for a request path,
     * and a hire screen that times out mid-scan is a hire screen that refuses
     * for the wrong reason. So the worker takes the scan on a schedule and the
     * request path derives from it.
     *
     * This does not weaken the invariant. `ProvenScope` is still only
     * constructible here, from a scan, and the scan carries the block it was
     * taken at — so a stale one is visible as stale rather than passing for
     * current. What it removes is the scanning, not the evidence.
     */
    scan?: CapabilityScan;
  } = {},
): Promise<ProvenScope | ScopeRefused> {
  const scan = opts.scan ?? (await scanCapability(chainId, agent, job, opts).catch(() => null));

  if (!scan) {
    return {
      refused: true,
      reason: "the capability scan could not be run",
      remedy: "Try again shortly. An unreadable scan must not become a silent denial.",
      scan: null,
    };
  }
  if (!scan.complete) {
    return {
      refused: true,
      reason: "the capability scan could not cover its whole range, so the evidence is unknown rather than absent",
      remedy: "Try again shortly, or configure an archive RPC to widen the window.",
      scan,
    };
  }
  if (scan.nonce === 0) {
    return {
      refused: true,
      reason: "this wallet has never sent a transaction, so it has provably never used any venue",
      remedy: "The agent has to actually transact at this job's venue before authority over it can be derived.",
      scan,
    };
  }

  const provenSet = new Set(scan.proven);
  const all = JOB_CALLS[job];
  const earned = all.filter((c) => provenSet.has(c.venue));
  const notEarned = all.filter((c) => !provenSet.has(c.venue));

  if (earned.length === 0) {
    return {
      refused: true,
      reason: `the chain does not show this wallet using any ${job} venue over ${scan.windowText}`,
      remedy:
        "Authority here is derived from what the chain has seen, so the agent has to use the venue once before it can be granted calls on it.",
      scan,
    };
  }

  const wrapper = recipientBound(chainId);
  const calls: AllowedCall[] = earned.map((c) => {
    /*
      A call that carries a destination argument is routed through the wrapper
      when one is deployed, and refused the binding claim when one is not. We
      do not say "bound to you" about a grant that is only isolated.
    */
    if (c.needsRecipientBinding && wrapper) {
      return {
        to: wrapper,
        target: "RecipientBound wrapper",
        signature: c.signature,
        plain: c.plain,
        recipient: {
          boundTo: "you",
          by: "wrapper",
          note: "This call is granted on a wrapper whose interface has no recipient parameter. The destination is written from immutable storage, so there is nothing for the agent to pass.",
        },
      };
    }
    return {
      to: c.to,
      target: VENUE_LABEL[c.venue] ?? c.venue,
      signature: c.signature,
      plain: c.plain,
      recipient: c.needsRecipientBinding
        ? {
            boundTo: "you",
            by: "session-key",
            note: "No recipient-binding wrapper is deployed for this pair, so this call's destination rests on account isolation rather than on a binding. That is weaker, and it is said here rather than implied.",
          }
        : null,
    };
  });

  const withheld: WithheldCall[] = [
    ...notEarned.map((c) => ({
      signature: c.signature,
      because: `The chain does not show this wallet at ${VENUE_LABEL[c.venue] ?? c.venue}, so it has not earned this call.`,
    })),
    ...ALWAYS_WITHHELD,
  ];

  return {
    [witness]: "derived from a capability scan",
    chainId,
    agent,
    job,
    calls,
    withheld,
    proven: scan.proven,
    scan,
    rationale: `Derived from ${scan.evidence.length} on-chain observation${scan.evidence.length === 1 ? "" : "s"} over ${scan.windowText}. Granted calls are the intersection of this job's canonical calls with the venues the chain shows this wallet using.`,
  } as ProvenScope;
}

/**
 * Turn a proven scope into the permissions object the account enforces.
 *
 * Takes a `ProvenScope` and nothing else. That signature is the enforcement:
 * there is no overload that accepts a job and a wallet, so there is no path to
 * a grant that skipped the scan.
 */
export function permissionsFor(
  scope: ProvenScope,
  limits: { capWei: bigint; period?: "day" | "week" | "month"; token?: Address },
): SessionPermissions {
  const calls: CallPermission[] = scope.calls.map((c) => ({ to: c.to, signature: c.signature }));
  return {
    calls,
    spend: [{ limit: limits.capWei, period: limits.period ?? "day", ...(limits.token ? { token: limits.token } : {}) }],
  };
}

/**
 * The leash as a document, generated from the grant rather than written twice.
 *
 * The hire screen renders this. There is no second copy of the allowlist in
 * the interface to drift out of step with what is actually signed, which is
 * the failure mode of every "here is what it can do" panel written as copy.
 */
export interface LeashDoc {
  job: JobSlug;
  may: { plain: string; signature: string; target: string; boundNote: string | null }[];
  mayNot: WithheldCall[];
  cap: string;
  expiry: string;
  enforcedBy: string[];
  rationale: string;
}

export function leashFor(scope: ProvenScope, limits: { capText: string; expiryText: string }): LeashDoc {
  return {
    job: scope.job,
    may: scope.calls.map((c) => ({
      plain: c.plain,
      signature: c.signature,
      target: c.target,
      boundNote: c.recipient?.note ?? null,
    })),
    mayNot: scope.withheld,
    cap: limits.capText,
    expiry: limits.expiryText,
    enforcedBy: [
      "The Altana account contract, which reverts a call outside the allowlist at validation time rather than after it executes.",
      ...(scope.calls.some((c) => c.recipient?.by === "wrapper")
        ? ["The RecipientBound wrapper, whose interface has no recipient parameter to abuse."]
        : []),
      "The expiry, on chain, rather than in a runner's configuration file.",
    ],
    rationale: scope.rationale,
  };
}
