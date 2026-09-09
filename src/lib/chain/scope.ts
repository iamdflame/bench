/**
 * granted ⊆ proven — authority derived from evidence, not from a claim.
 *
 * The assay already decided whether an agent may *bid*. It said nothing about
 * what the agent may *do*, because the session allowlist was a hardcoded
 * constant per category. So an agent that had never touched the position
 * manager could still be handed `mint` on it, on the strength of the word
 * "rebalancing" appearing in its own self-description. That is the same
 * take-my-word-for-it this market exists to refuse, sitting inside the
 * mechanism that is supposed to enforce it.
 *
 * Here the allowlist is the intersection of two sets:
 *
 *     granted = category's canonical calls ∩ protocols the chain shows it using
 *
 * and the invariant `granted ⊆ proven` holds by construction, because the
 * grant is *built from* the proof rather than checked against it afterwards.
 *
 * It is enforced by the type system, not by a runtime assertion that someone
 * can forget to call. `ProvenScope` carries a symbol this module does not
 * export, so no code outside this file can construct one. `grantMandateSession`
 * takes a `ProvenScope` and nothing else — a grant that has not been through
 * an assay does not compile.
 */

import type { StrictAgentCallPermission } from "@bnbagent/sdk/wallets";
import type { Address } from "viem";
import {
  CATEGORY_EVENT_PROBES,
  CATEGORY_EVIDENCE,
  CATEGORY_LABEL,
  PROTOCOL_LABEL,
  type Category,
} from "@/lib/config";
import type { AssayReport } from "@/lib/assay/types";
import { findProtocolTouches } from "@/lib/sources/bsc";
import { provenFor } from "@/lib/data/proven";
import { CATEGORY_CALLS, routeThroughWrapper } from "./session";

/**
 * How far back a grant looks for evidence of capability.
 *
 * Roughly three to seven days of BNB Smart Chain depending on block time, and
 * about twenty seconds of scanning. Both halves of that were measured; see the
 * note at the call site for what the shorter window was hiding.
 */
export const GRANT_LOOKBACK_BLOCKS = 400_000n;

/** Unexported, so a ProvenScope cannot be built anywhere but here. */
declare const witness: unique symbol;

export interface ProvenScope {
  readonly [witness]: "derived from an assay";
  agent: Address;
  category: Category;
  /** The calls the agent may make. Never wider than what the assay proved. */
  calls: StrictAgentCallPermission[];
  /** Protocol addresses the chain showed it using. */
  proven: string[];
  /** Calls the category permits that this agent has not earned. */
  withheld: { to: string; signature: string; because: string }[];
  /** Human-readable, for the grant record and the UI. */
  rationale: string;
}

export interface ScopeRefused {
  refused: true;
  reason: string;
  /** What would have to become true for a grant to be possible. */
  remedy: string;
}

export const isRefused = (s: ProvenScope | ScopeRefused): s is ScopeRefused =>
  (s as ScopeRefused).refused === true;

/**
 * Derives what an agent may be allowed to do from what it has been shown doing.
 *
 * Refuses rather than narrowing when the evidence is *unknown*: an incomplete
 * scan is not proof of absence, and quietly granting an empty allowlist on the
 * back of a refused RPC call would turn an infrastructure failure into a
 * silent policy decision.
 */
export function scopeFromAssay(
  report: AssayReport,
  category: Category,
  agent: Address,
): ProvenScope | ScopeRefused {
  const capability = report.results.find((r) => r.id === "capability");

  if (!capability?.proven) {
    return {
      refused: true,
      reason: "the assay did not reach the capability check, so nothing is proven",
      remedy: "run a complete assay against this agent before granting authority",
    };
  }
  return deriveScope(agent, category, capability.proven);
}

/**
 * The same derivation, for a wallet that is not a registry entry.
 *
 * A mandate's holder is an address, not a token id, so the full registry assay
 * has nothing to read. What the invariant actually needs is narrower than an
 * assay — which protocols has this wallet been shown using — so that is asked
 * of the chain directly. The rule and the refusals are identical; only the
 * source of the evidence differs.
 */
export async function scopeFromChain(
  agent: Address,
  category: Category,
): Promise<ProvenScope | ScopeRefused> {
  /*
    The committed evidence first, and it is not a shortcut.

    `npm run prove` reads two million blocks per wallet, which no request can
    afford, and writes down the protocol, the transaction and the block for
    every touch it finds. Reading that here is both faster and *deeper* than
    scanning live, and it is more checkable: the grant cites transactions a
    reader can open rather than a boolean produced inside a request nobody can
    repeat.

    A wallet the file does not cover falls through to the live scan below. An
    absent cache entry must never become a denial, which would be the same
    "refused for want of looking" this module keeps having to guard against.
  */
  const committed = provenFor(agent);
  if (committed && committed.complete) {
    return deriveScope(agent, category, {
      protocols: committed.protocols,
      complete: true,
      scannedBlocks: committed.scannedBlocks,
    });
  }

  const { touches, scannedBlocks, complete } = await findProtocolTouches(
    agent,
    CATEGORY_EVIDENCE[category],
    {
      /*
        Wider than the assay's window, and deliberately measured rather than
        picked.

        This decides what an agent may do with someone's capital, so a search
        that is too short refuses authority for want of looking rather than for
        want of evidence, which is the failure this module exists to avoid and
        was quietly committing. At 120,000 blocks the window is roughly a day
        of BNB Smart Chain, and a competent agent that worked on Tuesday looked
        identical to one that has never traded.

        Measured on 7 September 2026, against the three wallets that matter
        here: at 120,000 blocks every one of them, ours included, came back with
        no evidence at all. At 400,000 the PancakeSwap Positions touch on the
        rebalancer we most wanted to hire appears. Nothing changed on chain
        between those two readings except how far back we were willing to look.

        The cost is the other half of the measurement: about six seconds at
        120,000 blocks and about twenty at 400,000, which is affordable for a
        request that grants authority and would not be for a page view. So the
        assay keeps its shorter window and the grant pays for a longer one.
      */
      eventProbes: CATEGORY_EVENT_PROBES[category],
      lookbackBlocks: GRANT_LOOKBACK_BLOCKS,
    },
  );
  return deriveScope(agent, category, {
    protocols: [...new Set(touches.map((t) => t.protocol.toLowerCase()))],
    complete,
    scannedBlocks: scannedBlocks.toString(),
  });
}

function deriveScope(
  agent: Address,
  category: Category,
  capabilityProven: { protocols: string[]; complete: boolean; scannedBlocks: string },
): ProvenScope | ScopeRefused {
  const capability = { proven: capabilityProven };

  if (!capability.proven.complete) {
    return {
      refused: true,
      reason:
        "the capability scan was incomplete, a provider refused part of the range, so the absence of evidence here is not evidence of absence",
      remedy:
        "set ARCHIVE_RPC_URL, or retry when a provider will serve the range; an unreadable scan must not become a silent denial",
    };
  }

  const proven = new Set(capability.proven.protocols.map((p) => p.toLowerCase()));
  const canonical = CATEGORY_CALLS[category];

  const calls = canonical.filter((c) => proven.has(c.to.toLowerCase()));
  const withheld = canonical
    .filter((c) => !proven.has(c.to.toLowerCase()))
    .map((c) => ({
      to: c.to,
      signature: c.signature,
      because: `no interaction with ${PROTOCOL_LABEL[c.to.toLowerCase()] ?? c.to} in ${Number(
        capability.proven!.scannedBlocks,
      ).toLocaleString()} blocks`,
    }));

  if (calls.length === 0) {
    /*
      Named with its window, because "has not been shown" and "was not shown in
      the blocks we read" are different claims and only the second one is true.
      A refusal that implies the chain was searched exhaustively is the same
      overstatement this register objects to when other people make it.
    */
    const blocks = Number(capability.proven.scannedBlocks);
    return {
      refused: true,
      reason:
        `this agent was not shown using any ${CATEGORY_LABEL[category]} contract in the ` +
        `${blocks.toLocaleString()} blocks read, so there is no authority to derive from that evidence`,
      remedy:
        `it must transact with one of: ${canonical
          .map((c) => PROTOCOL_LABEL[c.to.toLowerCase()] ?? c.to)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ")}. If it did so before that window, set ARCHIVE_RPC_URL and the search widens ` +
        `to two million blocks rather than the agent being denied for want of looking.`,
    };
  }

  const usable = [...new Set(calls.map((c) => PROTOCOL_LABEL[c.to.toLowerCase()] ?? c.to))];

  /*
    The evidence decided what may be done; the wrapper decides where it is done.

    Routing happens after the intersection, never before, so the wrapper cannot
    widen a grant: a call the agent has not earned on the underlying protocol is
    not earned on a contract that forwards to it either.
  */
  const { calls: routed, wrapper } = routeThroughWrapper(category, calls);

  return {
    agent,
    category,
    calls: routed,
    proven: [...proven],
    withheld,
    rationale:
      `${calls.length} of ${canonical.length} ${CATEGORY_LABEL[category]} calls granted, on ${usable.join(", ")}` +
      (wrapper ? `, routed through the recipient-bound wrapper at ${wrapper} so the destination is not an argument the agent can pass` : "") +
      (withheld.length
        ? `; ${withheld.length} withheld because the chain has not shown this agent using ${[
            ...new Set(withheld.map((w) => PROTOCOL_LABEL[w.to.toLowerCase()] ?? w.to)),
          ].join(", ")}`
        : "; nothing withheld"),
  } as ProvenScope;
}
