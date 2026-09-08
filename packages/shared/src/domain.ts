/**
 * What an agent is, on this board.
 *
 * One record, assembled from four sources — the ERC-8004 registry, 8004scan,
 * Binance's B402 Bazaar, and our own probe — and deduplicated by
 * `(chainId, tokenId)` then clustered by the host its endpoint resolves to.
 *
 * The shape encodes the product's central idea. An agent does not have a
 * score; it has three *rails*, and each rail is either available with a price
 * we observed, or unavailable with the specific condition that failed. There
 * is no "trust level", no stars, and no aggregate. A row that cannot be hired
 * says which of the three ways it cannot be hired and why, which is both more
 * useful and more honest than a number.
 *
 * `RailState` is a discriminated union rather than a boolean plus an optional
 * reason, because that makes "available but we do not know the price" and
 * "unavailable but we did not record why" unrepresentable.
 */

import type { Address } from "viem";
import type { Maybe, Measurement } from "@bench/measure";
import type { SupportedChain } from "./chains";
import type { JobSlug } from "./jobs";

/** A price on a rail, in the token the rail actually settles in. */
export interface Price {
  /** Raw units. Never a float: money is not a float. */
  amount: bigint;
  decimals: number;
  symbol: string;
  asset: Address;
  /** Best-effort USD, for sorting only. Never rendered as the price itself. */
  approxUsd: number | null;
}

/**
 * Why a rail is closed.
 *
 * Every one of these is a condition we actually tested, and each maps to a
 * sentence on the agent page. The list is closed so that a new failure mode
 * has to be named rather than falling into a generic bucket.
 */
export type RailRefusal =
  // Rail 1 and general reachability
  | "no-endpoint"
  | "endpoint-404"
  | "endpoint-timeout"
  | "endpoint-error"
  | "blocked-host"
  | "card-unparseable"
  | "identical-bytes"
  | "no-402-challenge"
  | "unpayable-challenge"
  // Rail 2
  | "no-8183-seller"
  | "quote-refused"
  | "quote-expired"
  | "quote-unparseable"
  // Rail 3
  | "no-onchain-capability"
  | "capability-scan-incomplete"
  | "unsupported-venue"
  | "no-wallet"
  // any rail
  | "not-probed";

export const REFUSAL_TEXT: Record<RailRefusal, string> = {
  "no-endpoint": "Its registration declares no endpoint, so there is nothing to call.",
  "endpoint-404": "Its endpoint answered, with a 404. The address in the registration does not exist on that host.",
  "endpoint-timeout": "Its endpoint did not answer within the timeout.",
  "endpoint-error": "Its endpoint answered with an error rather than a payment challenge.",
  "blocked-host": "Its endpoint points at a private or loopback address, reachable from nowhere but its own machine.",
  "card-unparseable": "Its agent card could not be parsed, so we cannot tell what it claims to do.",
  "identical-bytes": "It returned byte-identical output to three different inputs. It is not reading the request.",
  "no-402-challenge": "It answered, but not with a payment challenge, so there is no priced call to sell.",
  "unpayable-challenge": "Its payment challenge asks for a chain or asset we cannot settle from BNB Chain.",
  "no-8183-seller": "It does not implement the ERC-8183 seller side, so there is no job to escrow against.",
  "quote-refused": "It was asked for a quote for this job and declined.",
  "quote-expired": "Its last quote had already expired when it arrived.",
  "quote-unparseable": "It returned something in place of a quote that we could not read as one.",
  "no-onchain-capability": "The chain does not show this wallet using this job's venue, so there is no evidence to derive authority from.",
  "capability-scan-incomplete": "The capability scan could not complete, and an unreadable scan must not become a silent denial.",
  "unsupported-venue": "This job's venue is not one this marketplace can scope a session over yet.",
  "no-wallet": "The registration does not resolve to a wallet, so there is nobody to grant authority to.",
  "not-probed": "We have not called it yet.",
};

export type RailState =
  | {
      available: true;
      price: Price;
      /** The observation that opened this rail. Always present when open. */
      provenAt: string;
      block: bigint;
      /** One line of what actually happened, for the evidence drawer. */
      evidence: string;
    }
  | { available: false; reason: RailRefusal; /** Extra specificity, when we have it. */ detail?: string };

export const railOpen = (r: RailState): r is Extract<RailState, { available: true }> => r.available;

export type RailName = "call" | "hire" | "mandate";

export const RAILS: RailName[] = ["call", "hire", "mandate"];

export const RAIL_COPY: Record<RailName, { verb: string; gives: string; holds: string; standard: string }> = {
  call: {
    verb: "Ask it once",
    gives: "Nothing but a payment.",
    holds: "No key, no funds of yours.",
    standard: "x402 / B402",
  },
  hire: {
    verb: "Hire it for one job",
    gives: "An escrow it can only open by delivering.",
    holds: "No key. The money sits in a contract until it delivers or the window expires.",
    standard: "ERC-8183 job escrow",
  },
  mandate: {
    verb: "Let it manage this",
    gives: "Standing authority over one position, capped and expiring.",
    holds: "A session key bound to a target, a selector, a cap and a clock.",
    standard: "Altana session + RecipientBound",
  },
};

/** What we learned by calling the endpoint. Recorded whether or not it worked. */
export interface ProbeResult {
  at: string;
  /** Milliseconds. Measured, never estimated. */
  latencyMs: number;
  status: number | null;
  /** Hash of the body, so a repeat answer is detectable. */
  bodyHash: string | null;
  /**
   * Did it return the same bytes to three different inputs?
   *
   * A single 200 reads as healthy on an endpoint that ignores the request
   * entirely. Three inputs is the cheapest test that catches it.
   */
  identicalAcrossInputs: boolean | null;
  refusal: RailRefusal | null;
}

export interface Agent {
  chainId: SupportedChain;
  tokenId: string;
  registry: Address;
  owner: Address | null;
  /** The wallet the agent acts from, if its card names a different one. */
  agentWallet: Address | null;
  name: string;
  description: string;
  /** The endpoint its registration declares, verbatim. */
  endpoint: string | null;

  /** Classified with evidence, never guessed from a keyword alone. */
  job: Maybe<JobSlug>;
  jobEvidence: string[];

  rails: Record<RailName, RailState>;
  probe: ProbeResult | null;

  /**
   * The host its endpoint resolves to, and how many other agents share it.
   *
   * On BNB Chain this is not a detail. Of the agents declaring any endpoint,
   * the overwhelming majority point at a single company's backend, so a board
   * ranked by count ranks one operator's batch registration at the top. The
   * cohort size travels on the row and the board collapses large ones.
   */
  originHost: string | null;
  originCohortSize: number;

  /** Category-specific, from chain. Empty is a legitimate state. */
  track: Measurement[];
  reputation: Maybe<{ raw: number; filtered: number; flaggedWallets: number; records: number }>;

  /** True for the reference agents this project operates. Never a ranking input. */
  isOurs: boolean;
  /** Where the record came from, for the evidence drawer. */
  sources: ("registry" | "scan" | "bazaar" | "probe" | "chain")[];
  /** When any part of this record was last touched. */
  updatedAt: string;
}

/**
 * A paid endpoint that is not an ERC-8004 registration.
 *
 * B402 Bazaar indexes services by URL, not by token id — most of them have no
 * ERC-8004 identity at all. They are real, callable, priced supply on BSC
 * mainnet and excluding them because they lack a token id would be a
 * marketplace refusing inventory over paperwork. They are listed with an
 * honest identity: the URL, the operator's payout address, and no claim of a
 * registry identity they do not have.
 */
export interface BazaarService {
  /** The resource URL. This is its identity. */
  resource: string;
  description: string;
  /** What the Bazaar index advertises. A claim. */
  advertised: { scheme: string; network: string; asset: Address; maxAmountRequired: string; payTo: Address }[];
  lastUpdatedMs: number;
  originHost: string;
  originCohortSize: number;
  /** What our own call actually got back. The fact. */
  probe: ProbeResult | null;
  /** Open only when a live challenge is payable from BNB Chain. */
  call: RailState;
  /**
   * Set when the live challenge disagrees with the Bazaar listing.
   *
   * This happens often enough to be a finding rather than an edge case: an
   * index entry advertising USD1 on chain 56 whose endpoint actually demands
   * USDC on Base. The listing is a claim; the challenge is the fact; and a
   * marketplace that renders the claim is selling something it did not check.
   */
  advertisedMismatch: string | null;
  job: Maybe<JobSlug>;
  updatedAt: string;
}

/**
 * The funnel, and the per-category counts the four doors are built from.
 *
 * `perJob` drives the doors directly. If a job's `hireable` is zero the door
 * says so and offers the callable count instead — a door never renders a bare
 * zero, because a zero with no explanation reads as a broken page rather than
 * as a finding.
 */
export interface Snapshot {
  generatedAt: string;
  chainId: SupportedChain;
  cutoff: { block: string; observedAt: string };
  registry: { registered: Maybe<number>; declaringEndpoint: Maybe<number>; read: number };
  /** Endpoint-host concentration. The single most important fact about this supply. */
  origins: { host: string; count: number; share: number }[];
  totals: {
    listed: number;
    callable: number;
    hireable: number;
    mandatable: number;
    probed: number;
    refused: number;
    duplicateOrigin: number;
    ours: number;
    bazaar: number;
  };
  perJob: Record<JobSlug, { listed: number; callable: number; hireable: number; mandatable: number; ours: number }>;
  /** Anything the sweep could not do, named. */
  limitations: string[];
}
