/**
 * Turning a classified row into something that can be called.
 *
 * The registry index says an agent declares an endpoint. It does not hand over
 * the URL — a list response carries a boolean, not an address — so every row on
 * the board arrived with all three rails closed and the same honest reason:
 * this deployment has not called it yet. That is true and it is also useless.
 * A market where nothing is reachable is a directory with extra steps.
 *
 * So this reads the chain. For each classified candidate it calls `ownerOf`
 * and `tokenURI` pinned to one block, resolves the card behind that URI —
 * inline `data:`, `ipfs:`, or an ordinary URL — and pulls the endpoint out of
 * whichever of the eleven fields the card happened to use.
 *
 * Only the classified set is resolved, and that is deliberate. 33,813 rows
 * declare an endpoint; 245 of them claim one of the four jobs this market
 * exists for. Resolving all 33,813 is 67,000 chain reads to learn the address
 * of an agent nobody can hire here anyway, and the ones worth resolving are
 * exactly the ones a category page will show.
 *
 * Every failure is recorded as a reason rather than a gap. "Its tokenURI is a
 * data: URI with no payload" and "we have not looked" are different states,
 * and a row that conflates them is lying about which.
 */

import { readRegistration, fetchCard, type AgentCard } from "@bench/index";
import type { SupportedChain } from "@bench/shared";
import { chainClient } from "@bench/shared";
import { readRegistrySummary, summaryPath, type RegistrySummary } from "./registry-walk";
import { writeAtomicJson, readJson, DATA_DIR } from "./store";
import { join } from "node:path";

/** What resolution found, or why it found nothing. */
export interface Resolved {
  tokenId: string;
  /** The owner, read from chain rather than from the index. */
  owner: string | null;
  tokenURI: string | null;
  /** The kind of URI, so `/data` can report the shape of the registry. */
  uriKind: "onchain-json" | "https" | "ipfs" | "bare-label" | "empty";
  endpoint: string | null;
  endpointField: string | null;
  agentWallet: string | null;
  skills: string[];
  /** Why there is no endpoint, when there is none. Never blank. */
  refusal: string | null;
  /** The block every read was pinned to. */
  block: string;
  resolvedAt: string;
}

export interface ResolveIndex {
  version: 1;
  chainId: SupportedChain;
  observedAt: string;
  /** How many classified rows exist, so coverage is legible. */
  classified: number;
  resolved: Resolved[];
}

export const resolvePath = (chainId: SupportedChain) => join(DATA_DIR, `resolved-${chainId}.json`);

export function readResolved(chainId: SupportedChain): ResolveIndex | null {
  return readJson<ResolveIndex>(resolvePath(chainId));
}

function uriKindOf(uri: string | null): Resolved["uriKind"] {
  if (!uri || uri.trim() === "") return "empty";
  const u = uri.trim();
  if (u.startsWith("data:")) return "onchain-json";
  if (u.startsWith("ipfs://")) return "ipfs";
  if (/^https?:\/\//i.test(u)) return "https";
  return "bare-label";
}

/**
 * Why a card yielded no endpoint.
 *
 * Separated from the resolution itself so the sentence a reader sees is
 * written once, in one place, rather than assembled at three call sites that
 * will drift.
 */
function refusalFor(uri: string | null, card: AgentCard | null, cardRefusal: string | null): string | null {
  if (!uri) return "The registry returns no tokenURI for this id.";
  if (cardRefusal) return cardRefusal;
  if (!card) return "Its tokenURI resolved to something that is not an agent card.";
  if (!card.endpoint) {
    return "Its card names no endpoint in any field we recognise, so there is no address to call.";
  }
  return null;
}

export interface ResolveReport {
  chainId: SupportedChain;
  attempted: number;
  withEndpoint: number;
  withoutEndpoint: number;
  byUriKind: Record<string, number>;
  seconds: number;
}

/**
 * Resolve the classified set.
 *
 * Bounded concurrency rather than a flood: these are chain reads against a
 * public RPC, and a hundred at once is how a crawl gets itself rate-limited
 * into looking like a broken deployment.
 */
export async function resolveClassified(
  chainId: SupportedChain,
  opts: { limit?: number; concurrency?: number; onProgress?: (m: string) => void } = {},
): Promise<ResolveReport> {
  const started = Date.now();
  const say = opts.onProgress ?? (() => {});
  const concurrency = opts.concurrency ?? 6;

  const summary: RegistrySummary | null = readRegistrySummary(chainId);
  if (!summary) throw new Error("No registry summary. Run `npm run index` first.");

  const targets = summary.classified.slice(0, opts.limit ?? summary.classified.length);
  const prior = new Map((readResolved(chainId)?.resolved ?? []).map((r) => [r.tokenId, r]));

  // One block for the whole pass, so every row is read at the same height and
  // the set is a snapshot rather than a smear across ten minutes of chain.
  const block = await chainClient(chainId).getBlockNumber();
  say(`resolving ${targets.length} classified agents at block ${block}`);

  /*
    Two passes, and the split is the whole point.

    Doing the chain read and the card fetch in one worker meant a slow IPFS
    gateway held a slot for eight seconds while the RPC connection sat idle
    beside it, and under that pressure the node started refusing reads. The
    result was 73 agents relabelled as having no tokenURI when a run minutes
    earlier had read one for every one of them — our own latency, recorded as
    a fact about somebody else's registration.

    So the chain is read first, quickly and at low concurrency, and every URI
    is banked before a single gateway is dialled. A gateway that hangs now
    costs a card, never a URI.
  */
  const reads = new Map<string, { owner: string | null; uri: string | null; unread: boolean }>();
  let cursor = 0;
  let done = 0;

  async function readWorker() {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      const c = targets[i]!;
      try {
        const reg = await readRegistration(chainId, c.tokenId, { block, withCard: false });
        reads.set(c.tokenId, { owner: reg.owner, uri: reg.tokenURI, unread: reg.unread });
      } catch {
        reads.set(c.tokenId, { owner: null, uri: null, unread: true });
      }
      done++;
      if (done % 50 === 0) say(`  read ${done}/${targets.length}`);
    }
  }

  await Promise.all(Array.from({ length: 4 }, readWorker));
  const withUri = [...reads.values()].filter((r) => r.uri).length;
  const unread = [...reads.values()].filter((r) => r.unread).length;
  say(`  ${withUri} tokenURIs read, ${unread} unreadable`);

  const out: Resolved[] = [];
  let cardCursor = 0;
  let cardsDone = 0;

  async function cardWorker() {
    for (;;) {
      const i = cardCursor++;
      if (i >= targets.length) return;
      const c = targets[i]!;
      const read = reads.get(c.tokenId)!;
      const kept = prior.get(c.tokenId);

      // Nothing was learned this pass, so nothing is overwritten.
      if (read.unread && kept) {
        out.push(kept);
        continue;
      }

      let card: AgentCard | null = null;
      let cardRefusal: string | null = null;
      if (read.uri) {
        const r = await fetchCard(read.uri);
        if (r.card) card = r.card;
        else cardRefusal = r.reason;
      }

      out.push({
        tokenId: c.tokenId,
        owner: read.owner,
        tokenURI: read.uri,
        uriKind: read.unread ? "empty" : uriKindOf(read.uri),
        endpoint: card?.endpoint ?? null,
        endpointField: card?.endpointField ?? null,
        agentWallet: card?.agentWallet ?? null,
        skills: card?.skills ?? [],
        refusal: read.unread
          ? "The registry could not be read for this id, so nothing is known about its card."
          : refusalFor(read.uri, card, cardRefusal),
        block: block.toString(),
        resolvedAt: new Date().toISOString(),
      });

      cardsDone++;
      if (cardsDone % 50 === 0) say(`  card ${cardsDone}/${targets.length}`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, cardWorker));


  const byUriKind: Record<string, number> = {};
  for (const r of out) byUriKind[r.uriKind] = (byUriKind[r.uriKind] ?? 0) + 1;

  const index: ResolveIndex = {
    version: 1,
    chainId,
    observedAt: new Date().toISOString(),
    classified: summary.classified.length,
    resolved: out,
  };
  writeAtomicJson(resolvePath(chainId), index);

  const withEndpoint = out.filter((r) => r.endpoint).length;
  return {
    chainId,
    attempted: out.length,
    withEndpoint,
    withoutEndpoint: out.length - withEndpoint,
    byUriKind,
    seconds: (Date.now() - started) / 1000,
  };
}

export { summaryPath };
