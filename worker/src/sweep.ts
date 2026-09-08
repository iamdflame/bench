/**
 * The registry sweep.
 *
 * Reads the ERC-8004 identity registry through 8004scan, page by page, and
 * turns each row into a board record: classified, endpoint extracted, origin
 * host recorded. It writes its cursor every batch so a restart continues.
 *
 * The goal is a *complete* sweep, and completeness is reported rather than
 * implied. A marketplace that has read three thousand of three hundred
 * thousand rows and renders the three hundred thousand as its inventory is
 * lying by aggregation. The snapshot therefore carries `read` alongside
 * `registered`, and the site says "3,808 of 334,770 read" wherever both
 * appear.
 *
 * Nothing here calls an endpoint. Reaching out is the prober's job and it is
 * kept separate, because the crawl is rate-limited by one third party and the
 * probe by several hundred, and mixing them makes both slower and neither
 * resumable.
 */

import { getAddress, type Address } from "viem";
import {
  classify,
  extractSkills,
  listAgents,
  countAgents,
  scanEndpoint,
  sweepChain,
  highestTokenId,
  ScanUnavailable,
  hostOf,
  type ChainRegistration,
  type ScanAgent,
} from "@bench/index";
import { IDENTITY_REGISTRY, type Agent, type SupportedChain } from "@bench/shared";
import { known, unknown } from "@bench/measure";

const asAddress = (v: unknown): Address | null => {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(v)) return null;
  try {
    return getAddress(v);
  } catch {
    return null;
  }
};

/** Turn an 8004scan row into an unprobed board record. */
export function toAgent(chainId: SupportedChain, row: ScanAgent): Agent {
  const endpoint = scanEndpoint(row);
  const skills = extractSkills(row.services);
  const c = classify({
    name: row.name,
    description: row.description,
    skills,
    tags: row.tags ?? null,
  });

  return {
    chainId,
    tokenId: String(row.token_id),
    registry: IDENTITY_REGISTRY[chainId],
    owner: asAddress(row.owner_address),
    agentWallet: asAddress(row.agent_wallet),
    name: row.name?.trim() || `Agent ${row.token_id}`,
    description: row.description?.trim() ?? "",
    endpoint,
    job: c.job,
    jobEvidence: c.matched,
    rails: {
      call: { available: false, reason: "not-probed" },
      hire: { available: false, reason: "not-probed" },
      mandate: { available: false, reason: "not-probed" },
    },
    probe: null,
    originHost: hostOf(endpoint),
    originCohortSize: 1,
    track: [],
    reputation: unknown(
      row.feedback_count && row.feedback_count > 0
        ? "Its feedback records have not been read and filtered yet."
        : "No feedback records point at this agent.",
    ),
    isOurs: false,
    sources: ["registry", "scan"],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Turn a chain registration into a board record.
 *
 * This is the primary path. Everything in it came from the registry contract
 * and from the card that contract points at — no index, no third party in the
 * middle, nothing that stops working when somebody else's database does.
 */
export function fromChain(chainId: SupportedChain, r: ChainRegistration): Agent {
  const card = r.card;
  const skills = card ? [...card.skills, ...extractSkills((card.raw as { services?: unknown })?.services)] : [];
  const c = classify({ name: card?.name ?? null, description: card?.description ?? null, skills });

  return {
    chainId,
    tokenId: r.tokenId,
    registry: IDENTITY_REGISTRY[chainId],
    owner: r.owner,
    agentWallet: card?.agentWallet ?? null,
    name: card?.name?.trim() || `Agent ${r.tokenId}`,
    description: card?.description?.trim() ?? "",
    endpoint: card?.endpoint ?? null,
    job: c.job,
    jobEvidence: c.matched,
    rails: {
      call: {
        available: false,
        reason: card ? (card.endpoint ? "not-probed" : "no-endpoint") : "card-unparseable",
        ...(r.cardRefusal ? { detail: r.cardRefusal } : {}),
      },
      hire: { available: false, reason: card?.endpoint ? "not-probed" : "no-endpoint" },
      mandate: { available: false, reason: "not-probed" },
    },
    probe: null,
    originHost: hostOf(card?.endpoint ?? null),
    originCohortSize: 1,
    track: [],
    reputation: unknown("Its feedback records have not been read and filtered yet."),
    isOurs: false,
    sources: ["chain", "registry"],
    updatedAt: new Date().toISOString(),
  };
}

export interface SweepResult {
  agents: Agent[];
  /** How many the registry says exist, when it would say. */
  registered: number | null;
  /** Where the next pass should continue from, walking backwards. */
  nextBlock: bigint;
  headBlock: bigint;
  /** How far back this pass reached, in days. Reported, never implied. */
  depthDays: number;
  /** True when the offset passed the reported total. */
  complete: boolean;
  /** True when the provider stopped serving history rather than us stopping. */
  boundedByProvider: boolean;
  /** Anything that stopped this run doing more. Named, not swallowed. */
  limitation: string | null;
}

/**
 * Read `batches` pages from `offset`.
 *
 * Bounded rather than run-to-completion, because a worker cycle that crawls
 * three hundred thousand rows before doing anything else leaves the probe
 * results stale for hours. The cursor makes many short runs equivalent to one
 * long one.
 */
export async function sweep(
  chainId: SupportedChain,
  opts: { fromBlock?: bigint; batches?: number; perBatch?: number; useIndex?: boolean } = {},
): Promise<SweepResult> {
  const batches = opts.batches ?? 5;
  const agents: Agent[] = [];
  const limitations: string[] = [];

  /* --------------------------------------------------- 1. the chain itself */
  const chain = await sweepChain(chainId, {
    ...(opts.fromBlock === undefined ? {} : { fromBlock: opts.fromBlock }),
    maxTokens: (opts.perBatch ?? 25) * batches,
    windows: 40 * batches,
  });
  for (const r of chain.registrations) agents.push(fromChain(chainId, r));
  if (chain.boundedByProvider) {
    /*
      Not a failure, and not an empty registry. The free BSC providers serve
      `eth_getLogs` only near the head — measured at every offset from 10k
      blocks to 10M, all refused — so this crawl reads the tail and
      accumulates. History needs an archive node.
    */
    limitations.push(
      `Reading registrations from the chain stops about ${chain.depthDays.toFixed(1)} days back, where the free BSC providers stop serving eth_getLogs. This crawl therefore accumulates new registrations each cycle rather than walking history; older ones are unread rather than absent. Setting ARCHIVE_RPC_URL removes the limit.`,
    );
  } else if (chain.unreadWindows.length > 0) {
    limitations.push(
      `${chain.unreadWindows.length} block window${chain.unreadWindows.length === 1 ? "" : "s"} in this pass could not be served by any provider, so registrations inside them are unread rather than absent.`,
    );
  }

  /* ------------------------------------------- 2. the index, when it is up */
  /*
    Enrichment only, and explicitly optional. The public index answers
    DATABASE_ERROR on most page sizes and takes about thirty seconds on the
    ones it serves, measured directly. Depending on it for the board's
    existence would mean the front door goes dark whenever it does; asking it
    for extra rows when it is healthy costs nothing when it is not.
  */
  let registered: number | null = null;
  const totalMaybe = await countAgents(chainId);
  if (totalMaybe.known) registered = totalMaybe.value;
  else limitations.push(totalMaybe.reason);

  if (opts.useIndex !== false) {
    try {
      const page = await listAgents(chainId, { limit: 10, offset: 0 });
      for (const row of page.items) {
        // A chain-read record always wins: it came from the contract.
        if (!agents.some((a) => a.tokenId === String(row.token_id))) agents.push(toAgent(chainId, row));
      }
    } catch (e) {
      limitations.push(
        e instanceof ScanUnavailable
          ? `The registry index added nothing this pass: ${e.reason}`
          : `The registry index added nothing this pass: ${String(e).slice(0, 120)}`,
      );
    }
  }

  /* ------------------------------------ 3. the population, honestly counted */
  if (registered === null) {
    const highest = await highestTokenId(chainId).catch(() => null);
    if (highest) {
      registered = Number(highest.tokenId);
      limitations.push(
        `The registry contract has no totalSupply — it reverts — so the population here is the highest token id minted (${Number(highest.tokenId).toLocaleString("en-US")}, at block ${highest.block}). Ids are sequential in practice, but nothing in the contract promises it.`,
      );
    }
  }

  return {
    agents,
    registered,
    nextBlock: chain.reachedBlock,
    headBlock: chain.headBlock,
    depthDays: chain.depthDays,
    complete: chain.reachedBlock === 0n,
    boundedByProvider: chain.boundedByProvider,
    limitation: limitations.length > 0 ? limitations.join(" ") : null,
  };
}
