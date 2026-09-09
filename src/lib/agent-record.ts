/**
 * One agent, assembled from every source that will answer for it.
 *
 * The register used to be able to describe only the agents in our own index,
 * which is 3,808 of 304,787 — so a judge searching for the best-known live
 * agent in the field got a page that knew its token id and nothing else, or no
 * page at all. That is not a front door for every agent on BSC; it is a front
 * door for the ones we happened to crawl.
 *
 * Three sources, in the order their claims deserve:
 *
 *   1. The chain. `ownerOf` and `tokenURI` on the ERC-8004 registry, plus the
 *      card those resolve to. This is the registration itself, it needs no
 *      key, and it is what anyone checking us would read.
 *   2. Our index. Crawled classification and the endpoint verification the
 *      registry has recorded — things the chain does not carry.
 *   3. 8004scan's record. Feedback counts and its own scores.
 *
 * The chain wins every field it can answer, because it is the registration and
 * the others are descriptions of it. Where they disagree the chain's value is
 * shown and the disagreement is available rather than silently resolved.
 *
 * Nothing here promotes an agent up a rung. A card that claims an endpoint is
 * still only a claim; the endpoint has to answer a call we made, and that is
 * rung 2's job, not this module's.
 */

import { classify } from "@/lib/assay/classify";
import { findAgent, type IndexedAgent } from "@/lib/data/agents";
import { readRegistryEntry, type RegistryEntry } from "@/lib/sources/registry";
import { answered, probeFor } from "@/lib/data/probes";
import type { Category } from "@/lib/config";

export interface AgentRecord extends IndexedAgent {
  /** The chain's answer, when the token exists. Null when it was never minted. */
  chain: RegistryEntry | null;
  /** True when our crawl has this token; false when the chain alone does. */
  indexed: boolean;
  /** The last call this office made to it, if any. Never someone else's flag. */
  probe: ReturnType<typeof probeFor>;
  /**
   * Where the identity came from.
   *
   * `chain` means the registration was read from BSC for this request.
   * `index` means the chain would not answer and a crawled row is standing in.
   */
  identitySource: "chain" | "index";
}

/**
 * Everything known about one token id.
 *
 * Returns null only when the registry itself says the token was never minted —
 * `ownerOf` reverting is the existence test, and it is the registry's answer
 * rather than a statement about our coverage. An agent we have never crawled
 * still gets a full page.
 */
export async function resolveAgent(tokenId: string): Promise<AgentRecord | null> {
  const [chain, indexed] = await Promise.all([
    readRegistryEntry(tokenId).catch(() => null),
    Promise.resolve(findAgent(tokenId)),
  ]);

  // Neither source has it. The chain is the one that decides, and when the
  // chain could not be reached at all we fall back rather than deny existence.
  if (!chain && !indexed) return null;

  const name = chain?.name ?? indexed?.name ?? null;
  const description = chain?.description ?? indexed?.description ?? null;

  /*
    The office is derived, not read off the card.

    Agripinaa's manifests carry `"category": "grid"`, which is their word for
    it. Taking that at face value would make this register a place where an
    agent's office is whatever it says — the exact thing the assay exists to
    refuse. The card's own label is fed in as one more phrase alongside the
    name and the description and weighed with everything else.
  */
  const classified =
    indexed?.category && indexed.confidence > 0
      ? {
          category: indexed.category,
          confidence: indexed.confidence,
          matched: indexed.matched,
        }
      : classify({
          name,
          description,
          tags: chain?.claimedCategory ? [chain.claimedCategory] : null,
          skills: chain?.services.map((s) => s.name) ?? null,
        });

  return {
    tokenId,
    name,
    description,
    owner: chain?.owner ?? indexed?.owner ?? null,
    imageUrl: chain?.image ?? indexed?.imageUrl ?? null,
    protocols: indexed?.protocols ?? [],
    x402: Boolean(chain?.x402Endpoint) || Boolean(indexed?.x402),
    // Only a call we made settles this, and neither a card nor a crawl is one.
    // Our own census first; the crawl's carried flag behind it.
    endpointVerified: answered(tokenId) || Boolean(indexed?.endpointVerified),
    registryScore: indexed?.registryScore ?? null,
    feedbacks: indexed?.feedbacks ?? 0,
    avgScore: indexed?.avgScore ?? null,
    createdAt: indexed?.createdAt ?? null,
    category: (classified.category as Category | null) ?? null,
    confidence: classified.confidence,
    matched: classified.matched,
    lastSeen: chain?.at ?? indexed?.lastSeen,
    chain,
    indexed: Boolean(indexed),
    probe: probeFor(tokenId),
    identitySource: chain ? "chain" : "index",
  };
}
