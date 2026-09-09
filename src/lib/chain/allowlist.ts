/**
 * The leash, published as a document.
 *
 * A hire is an allowlist. Everything else on the ticket is presentation. So the
 * allowlist is written down in one place, versioned, served as JSON at a stable
 * URL, and rendered into English on the ticket from that same object. There is
 * no second copy of it in the interface to drift out of step with what the
 * grant actually signs.
 *
 * Three things this document says that a target-plus-selector grant cannot:
 *
 *   1. MAY NOT. The selectors deliberately absent, and why. A grant is defined
 *      as much by what it withholds, and a reader cannot infer an absence from
 *      a list of presences.
 *   2. RECIPIENT BINDING. Where a call carries a destination argument, who that
 *      destination is pinned to and by what mechanism. A session key binds a
 *      target and four bytes; it cannot bind an argument. Saying so, and naming
 *      the contract that closes it, is the difference between a boundary and a
 *      binding.
 *   3. WHAT ENFORCES IT. Per clause: the session key, the wrapper contract, or
 *      the market. A rule with no named enforcer is a promise.
 */

import { CATEGORY_CALLS, WRAPPER_ROUTE, recipientBoundAddress } from "./session";
import { CATEGORY_LABEL, PROTOCOL_LABEL, PROTOCOLS, type Category } from "@/lib/config";

/** Bumped when the meaning of a grant changes, never for wording. */
export const ALLOWLIST_VERSION = "1.2.0";

export type Enforcer = "session-key" | "wrapper" | "market";

export interface AllowedCall {
  to: string;
  target: string;
  signature: string;
  /** What it does, for a person reading the ticket. */
  plain: string;
  /**
   * Where value goes, and what pins it there.
   *
   * Null when the call moves nothing outward. Present, and specific, when it
   * does: this is the field the whole document exists for.
   */
  recipient: { boundTo: "session owner"; by: Enforcer; note: string } | null;
}

export interface WithheldCall {
  signature: string;
  because: string;
}

export interface AllowlistDoc {
  version: string;
  category: Category;
  label: string;
  /** Contract the session key is granted on. */
  targets: string[];
  may: AllowedCall[];
  mayNot: WithheldCall[];
  /** Bounds that are on chain rather than in a process. */
  bounds: { cap: string; expiry: string; revocation: string };
  invariant: string;
  /**
   * How recipient binding is achieved for this category, in one sentence.
   *
   * Honest per category: rebalancing needs a wrapper because PancakeSwap's
   * position manager takes a recipient argument. Health factor does not,
   * because repaying a loan credits the loan. Claiming a binding where none is
   * needed would be as dishonest as omitting one where it is.
   */
  binding: string;
}

/**
 * Calls the category's protocols expose that this grant deliberately omits.
 *
 * Named individually rather than described as "everything else", because
 * "everything else" is what an allowlist says when nobody has checked. Each of
 * these is a real selector on a target in this category, and each one is a way
 * value could leave to an address the principal did not choose.
 */
const WITHHELD: Record<Category, WithheldCall[]> = {
  rebalancing: [
    { signature: "sweepToken(address,uint256,address)", because: "sends any token balance to an arbitrary address" },
    { signature: "refundETH()", because: "returns native value to the caller, which is the agent, not you" },
    { signature: "unwrapWETH9(uint256,address)", because: "unwraps to an arbitrary recipient" },
    { signature: "multicall(bytes[])", because: "batches the three above past a per-selector allowlist" },
    { signature: "burn(uint256)", because: "destroys a position; closing one is decreaseLiquidity then collect" },
    { signature: "safeTransferFrom(address,address,uint256)", because: "moves the position NFT itself out of your ownership" },
    { signature: "approve(address,uint256)", because: "delegates your position to a fourth party" },
  ],
  "grid-trading": [
    { signature: "sweepToken(address,uint256,address)", because: "sends any token balance to an arbitrary address" },
    { signature: "refundETH()", because: "returns native value to the caller" },
    { signature: "unwrapWETH9(uint256,address)", because: "unwraps to an arbitrary recipient" },
    { signature: "multicall(bytes[])", because: "batches the three above past a per-selector allowlist" },
    { signature: "exactOutput((bytes,address,uint256,uint256))", because: "not needed to work a grid, and takes a recipient" },
  ],
  "yield-optimisation": [
    { signature: "redeem(uint256)", because: "redeems the whole position rather than a stated amount" },
    { signature: "borrow(uint256)", because: "opens leverage; this job supplies and redeems, it does not borrow" },
    { signature: "transfer(address,uint256)", because: "moves the receipt token itself off your account" },
    { signature: "withdrawTo(uint256,address)", because: "names a destination that is not necessarily you" },
  ],
  "health-factor": [
    { signature: "borrow(uint256)", because: "a defender that may borrow can create the risk it is paid to prevent" },
    { signature: "redeemUnderlying(uint256)", because: "withdraws collateral, which is the opposite of defending the loan" },
    { signature: "exitMarket(address)", because: "removes collateral from the market and drops the health factor" },
    { signature: "transfer(address,uint256)", because: "moves the receipt token off your account" },
  ],
};

const PLAIN: Record<string, string> = {
  mint: "open a liquidity position for you",
  increaseLiquidity: "add to a position you already own",
  decreaseLiquidity: "withdraw liquidity from your position",
  collect: "collect fees and withdrawn principal",
  exactInputSingle: "swap one pair inside your band",
  exactInput: "swap along a route inside your band",
  harvest: "claim farming rewards",
  redeemUnderlying: "withdraw a stated amount of your supplied capital",
  repayBorrow: "repay your loan",
  enterMarkets: "enable your collateral in the lending market",
};

/**
 * The rebalancing wrapper.
 *
 * Set once the contract is deployed and verified. Until it is, this reads null
 * and the document says the binding is pending rather than claiming a contract
 * that does not exist. A published allowlist naming an undeployed address would
 * be precisely the unverifiable claim the rest of this codebase refuses.
 */
export const RECIPIENT_BOUND_WRAPPER: string | null = recipientBoundAddress();

/**
 * Where the wrapper's source can be read, by someone who does not trust us.
 *
 * Sourcify rather than a block explorer as the primary link: it verified the
 * deployed bytecode against this repository's source as an exact match, needs
 * no API key to check, and publishes the source files themselves. A reader can
 * diff what is running against what is committed here, which is the only sense
 * of "verified" worth the word.
 */
export const wrapperSourceUrl = (address: string) =>
  `https://repo.sourcify.dev/56/${address}`;

/**
 * Calls that actually carry a destination argument, keyed by full signature.
 *
 * Keyed by signature and not by name, because the name is not enough and the
 * difference is load-bearing. PancakeSwap's `mint((address,address,uint24,…,
 * address,uint256))` takes a recipient. Venus's `mint()` on vBNB takes nothing
 * and credits the caller. Matching on "mint" claimed a recipient binding on a
 * call with no recipient in it, which is a small lie of exactly the kind this
 * document exists to prevent, in the document itself.
 */
const CARRIES_RECIPIENT = new Set([
  // PancakeSwap V3 NonfungiblePositionManager: `recipient` is the tenth field.
  "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))",
  // `recipient` is the second field.
  "collect((uint256,address,uint128,uint128))",
  // SwapRouter: `recipient` is the fourth field of the struct.
  "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
  // `recipient` is the second field.
  "exactInput((bytes,address,uint256,uint256))",
  // MasterChef V3: the second argument is the address rewards are sent to.
  "harvest(uint256,address)",
]);

function bindingFor(category: Category): string {
  if (category === "rebalancing") {
    return RECIPIENT_BOUND_WRAPPER
      ? `mint and collect take a recipient argument, and a session key binds a target and a selector, never an argument. So this grant is not issued on the position manager. It is issued on RecipientBound at ${RECIPIENT_BOUND_WRAPPER}, whose mint and collect have no recipient parameter at all: the destination is written from immutable storage. There is nothing for the agent to pass, and nothing to get wrong.`
      : "mint and collect take a recipient argument, and a session key binds a target and a selector, never an argument. The RecipientBound wrapper that closes this is written and tested; until its address is set here, this document reports the grant as target-and-selector bound only, which is the same boundary every other operator has.";
  }
  if (category === "grid-trading") {
    return "The router's swap calls take a recipient. The grant is target and selector bound, and the withheld list removes sweepToken, unwrapWETH9 and multicall, which are the routes by which a swap's proceeds reach a third address.";
  }
  if (category === "health-factor") {
    return "No call in this grant takes a destination. Repaying a loan credits the loan; entering a market touches no balance. There is no recipient to bind, and claiming one would be theatre.";
  }
  return "harvest takes a recipient. The grant is target and selector bound, and borrowing, redeeming in full and transferring the receipt token are all withheld.";
}

export function allowlistFor(category: Category): AllowlistDoc {
  const calls = CATEGORY_CALLS[category];
  const route = WRAPPER_ROUTE[category];
  const wrapper = RECIPIENT_BOUND_WRAPPER;
  /*
    The document describes the grant that is actually issued.

    It used to render the wrapper as the target whenever one was configured,
    while `scopeFromChain` went on granting the position manager. The page and
    the signature disagreed about the single claim this product leans on
    hardest, which is worse than not making the claim. Both now read the same
    routing table, so the only way they can diverge is a code change that breaks
    the test asserting they do not.
  */
  const useWrapper = Boolean(route && wrapper);

  return {
    version: ALLOWLIST_VERSION,
    category,
    label: CATEGORY_LABEL[category],
    targets: useWrapper
      ? [wrapper as string]
      : [...new Set(calls.map((c) => c.to))],
    may: calls.map((c) => {
      const fn = c.signature.split("(")[0];
      const routedSig = useWrapper ? route!.signatures[c.signature] : undefined;
      const to = routedSig ? (wrapper as string) : c.to;
      return {
        to,
        target: routedSig
          ? `RecipientBound, forwarding to ${PROTOCOL_LABEL[c.to.toLowerCase()] ?? c.to}`
          : (PROTOCOL_LABEL[c.to.toLowerCase()] ?? c.to),
        signature: routedSig ?? c.signature,
        plain: PLAIN[fn] ?? fn,
        recipient: CARRIES_RECIPIENT.has(c.signature)
          ? {
              boundTo: "session owner" as const,
              by: (routedSig ? "wrapper" : "session-key") as Enforcer,
              note: routedSig
                ? "written by the wrapper from immutable storage; the signature has no recipient parameter for the agent to pass"
                : "target and selector bound; the argument itself is not bindable by a session key",
            }
          : null,
      };
    }),
    mayNot: WITHHELD[category],
    bounds: {
      cap: "a spend cap in wei, enforced by the session key, never larger than the capital under mandate",
      expiry: "a unix timestamp on the session key, and on the wrapper where one is used",
      revocation: "one transaction from the desk; the key stops working the moment it lands",
    },
    invariant:
      "granted is a subset of proven: the calls in this grant are the category's calls intersected with the protocols the chain has shown this agent using.",
    binding: bindingFor(category),
  };
}

/** Every category's document, for the machine front door. */
export function allowlistIndex(): AllowlistDoc[] {
  return (Object.keys(CATEGORY_CALLS) as Category[]).map(allowlistFor);
}

/** The position manager, named where the wrapper's claim can be checked. */
export const POSITION_MANAGER = PROTOCOLS.pancakeV3PositionManager;
