/**
 * Reading the ERC-8004 identity registry directly.
 *
 * 8004scan is faster and richer and it is used for enrichment, but it is one
 * company's index of a public registry, and a marketplace whose front door
 * fails when a third party rate-limits it is not the front door. So the
 * authority is the chain: `ownerOf` and `tokenURI`, read from BSC, with the
 * card fetched and parsed here.
 *
 * Two facts about the deployed registry that shape this file:
 *
 *   - `totalSupply()` reverts. It is not implemented, so the population cannot
 *     be read with one call and any figure claiming to be "all agents" comes
 *     from somewhere else and must say where.
 *   - `tokenURI` returns either an https URL or an inline `data:` URI. Both
 *     are common; the second is the honest one, because it cannot rot.
 */

import { getAddress, type Address } from "viem";
import {
  IDENTITY_ABI,
  IDENTITY_REGISTRY,
  chainClient,
  safeFetch,
  type SupportedChain,
} from "@bench/shared";

/**
 * An ERC-8004 registration card, in the fields this product actually uses.
 *
 * The standard is loose about where the endpoint lives and half the field
 * writes it somewhere different, so all the known spellings are read and the
 * first one that is a usable URL wins. Recording which key it came from
 * matters: an agent whose endpoint is only in a non-standard field is telling
 * you something about how carefully it was registered.
 */
export interface AgentCard {
  name: string | null;
  description: string | null;
  /** The endpoint, and which field it was found in. */
  endpoint: string | null;
  endpointField: string | null;
  /** A wallet distinct from the owner, when the card declares one. */
  agentWallet: Address | null;
  skills: string[];
  raw: unknown;
}

const ENDPOINT_FIELDS = [
  "a2a_endpoint",
  "a2aEndpoint",
  "endpoint",
  "url",
  "agent_url",
  "agentUrl",
  "service_endpoint",
  "serviceEndpoint",
  "mcp_server",
  "mcpServer",
  "api",
] as const;

function pickEndpoint(obj: Record<string, unknown>): { url: string; field: string } | null {
  for (const f of ENDPOINT_FIELDS) {
    const v = obj[f];
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) return { url: v.trim(), field: f };
  }
  // Some cards nest the endpoint one level down under a services map.
  const services = obj.services ?? obj.service;
  if (services && typeof services === "object") {
    for (const s of Object.values(services as Record<string, unknown>)) {
      if (s && typeof s === "object") {
        const hit = pickEndpoint(s as Record<string, unknown>);
        if (hit) return { url: hit.url, field: `services.${hit.field}` };
      }
    }
  }
  return null;
}

function asAddress(v: unknown): Address | null {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(v)) return null;
  try {
    return getAddress(v);
  } catch {
    return null;
  }
}

export function parseCard(text: string): AgentCard | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const ep = pickEndpoint(o);
  const skills = Array.isArray(o.skills)
    ? o.skills.filter((s): s is string => typeof s === "string")
    : [];
  return {
    name: typeof o.name === "string" ? o.name : null,
    description: typeof o.description === "string" ? o.description : null,
    endpoint: ep?.url ?? null,
    endpointField: ep?.field ?? null,
    agentWallet: asAddress(o.agent_wallet ?? o.agentWallet ?? o.wallet),
    skills,
    raw: obj,
  };
}

/**
 * Resolve a `tokenURI` into a card.
 *
 * `data:` URIs are decoded locally — no network, no failure mode. An https URI
 * is fetched through the SSRF guard, because it is a string a stranger wrote
 * into a public contract and pointing our server at it unguarded is the
 * attack, not the feature.
 */
/**
 * Gateways for `ipfs://`, in the order they are tried.
 *
 * Two, because one is a single point of failure for the forty per cent of this
 * market that pins its card on IPFS. Both are read through the same SSRF guard
 * as any other URL — the content id is interpolated into a host we chose, so a
 * hostile `ipfs://` value cannot redirect the fetch anywhere.
 */
const IPFS_GATEWAYS = ["https://ipfs.io/ipfs/", "https://cloudflare-ipfs.com/ipfs/"] as const;

export async function fetchCard(
  tokenURI: string,
): Promise<{ card: AgentCard; via: "inline" | "http" } | { card: null; reason: string }> {
  const uri = tokenURI.trim();

  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    if (comma < 0) return { card: null, reason: "Its tokenURI is a data: URI with no payload." };
    const meta = uri.slice(5, comma);
    const payload = uri.slice(comma + 1);
    let text: string;
    try {
      text = meta.includes(";base64")
        ? Buffer.from(payload, "base64").toString("utf8")
        : decodeURIComponent(payload);
    } catch {
      return { card: null, reason: "Its inline tokenURI could not be decoded." };
    }
    const card = parseCard(text);
    return card ? { card, via: "inline" } : { card: null, reason: "Its inline card is not parseable JSON." };
  }

  /*
    `ipfs://` is a URL we can fetch, through a gateway.

    It used to be refused as "not a URL we can fetch", and that sentence was
    about us rather than about the agent: 98 of the 245 agents that claim one
    of the four jobs — forty per cent of the entire addressable market —
    pinned their card on IPFS and were recorded as unreachable because this
    code declined to look. A refusal that describes our own gap as the
    counterparty's defect is the exact failure this codebase exists to avoid.

    Two gateways, tried in order, because one gateway is a single point of
    failure for forty per cent of the market. The CID is taken verbatim: a
    path is allowed after it, a host is not — `ipfs://evil.com/x` must not
    become a fetch of evil.com, and the guard below is what stops it.
  */
  if (/^ipfs:\/\//i.test(uri)) {
    const cid = uri.slice(7).replace(/^ipfs\//, "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(\/[^\s]*)?$/.test(cid)) {
      return { card: null, reason: "Its ipfs:// tokenURI does not name a content id we can resolve." };
    }
    for (const gateway of IPFS_GATEWAYS) {
      const res = await safeFetch(gateway + cid, { timeoutMs: 8_000, maxBytes: 256 * 1024 });
      if (!res.ok || res.status >= 400) continue;
      const card = parseCard(res.body);
      if (card) return { card, via: "http" };
      return { card: null, reason: "Its IPFS card resolved, with something that is not a parseable card." };
    }
    return { card: null, reason: "Its IPFS card could not be fetched from any gateway we tried." };
  }

  if (!/^https?:\/\//i.test(uri)) {
    return { card: null, reason: `Its tokenURI is not a URL we can fetch: ${uri.slice(0, 60)}` };
  }

  /*
    A tokenURI carrying an unsubstituted template is a registration nobody
    finished, and it is common enough to deserve its own sentence rather than
    being reported as a 404 an hour later.
  */
  if (/\{.*\}/.test(uri)) {
    return { card: null, reason: "Its tokenURI still contains an unsubstituted template placeholder." };
  }

  const res = await safeFetch(uri, { timeoutMs: 8_000, maxBytes: 256 * 1024 });
  if (!res.ok) return { card: null, reason: res.detail };
  if (res.status >= 400) return { card: null, reason: `Its card URL answered ${res.status}.` };
  const card = parseCard(res.body);
  return card ? { card, via: "http" } : { card: null, reason: "Its card URL answered, with something that is not a parseable card." };
}

export interface Registration {
  chainId: SupportedChain;
  tokenId: string;
  registry: Address;
  owner: Address | null;
  tokenURI: string | null;
  card: AgentCard | null;
  /** Why there is no card, when there is none. Never left blank. */
  cardRefusal: string | null;
  /**
   * True when the chain read failed rather than answering.
   *
   * The caller needs this to tell "this agent has no tokenURI" from "we could
   * not ask", because only the first is a fact about the agent and only the
   * second should be retried.
   */
  unread: boolean;
  /** The block the reads were pinned to. */
  block: bigint;
}

/**
 * Read one registration straight from the chain.
 *
 * Both reads are pinned to one block. A record assembled from two heights is
 * not a measurement of anything, and on a chain with sub-second blocks the two
 * calls genuinely land in different ones.
 */
export async function readRegistration(
  chainId: SupportedChain,
  tokenId: string,
  opts: { block?: bigint; withCard?: boolean } = {},
): Promise<Registration> {
  const client = chainClient(chainId);
  const registry = IDENTITY_REGISTRY[chainId];
  const block = opts.block ?? (await client.getBlockNumber());
  const id = BigInt(tokenId);

  /*
    A failed read is not an empty answer.

    Both calls used to collapse to null on any error, so an RPC that timed out
    produced a record indistinguishable from an agent that genuinely registered
    no tokenURI — and the sentence a reader saw was "the registry returns no
    tokenURI for this id", which is a claim about the agent made from evidence
    about our own connection. Measured: a heavier pass rate-limited the node and
    73 of 245 agents were relabelled as having no URI, when a run minutes
    earlier had read one for every single one of them.

    So the two failures are kept apart. `ownerOf` reverting is the registry's
    way of saying a token does not exist and stays a null; a transport failure
    is recorded as one, and the caller is told it could not look rather than
    told what it found.
  */
  const [ownerR, uriR] = await Promise.allSettled([
    client.readContract({
      address: registry,
      abi: IDENTITY_ABI,
      functionName: "ownerOf",
      args: [id],
      blockNumber: block,
    }),
    client.readContract({
      address: registry,
      abi: IDENTITY_ABI,
      functionName: "tokenURI",
      args: [id],
      blockNumber: block,
    }),
  ]);

  const owner = ownerR.status === "fulfilled" ? ownerR.value : null;

  /*
    Distinguishing "reverted" from "could not reach the node" from the error
    itself: viem wraps a revert as ContractFunctionExecutionError and a
    transport problem as an HTTP or timeout error, and only the first is the
    chain answering.
  */
  const uriFailed =
    uriR.status === "rejected" && !/revert|execution reverted/i.test(String(uriR.reason ?? ""));
  const uri = uriR.status === "fulfilled" ? uriR.value : null;

  let card: AgentCard | null = null;
  let cardRefusal: string | null = null;
  if (opts.withCard !== false && typeof uri === "string" && uri.length > 0) {
    const r = await fetchCard(uri);
    if (r.card) card = r.card;
    else cardRefusal = r.reason;
  } else if (uriFailed) {
    cardRefusal = "The registry could not be read for this id, so nothing is known about its card.";
  } else if (!uri) {
    cardRefusal = "The registry does not return a tokenURI for this id.";
  }

  return {
    chainId,
    tokenId,
    registry,
    owner: (owner as Address | null) ?? null,
    tokenURI: typeof uri === "string" ? uri : null,
    unread: uriFailed,
    card,
    cardRefusal,
    block,
  };
}

/**
 * Does this token exist at all?
 *
 * `ownerOf` reverting is the registry's way of saying no, and it is the
 * cheapest possible check — one call, no card fetch. The register's search box
 * uses it so that typing any id resolves against the chain rather than against
 * whatever we happen to have crawled.
 */
export async function tokenExists(chainId: SupportedChain, tokenId: string): Promise<boolean> {
  try {
    await chainClient(chainId).readContract({
      address: IDENTITY_REGISTRY[chainId],
      abi: IDENTITY_ABI,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
    return true;
  } catch {
    return false;
  }
}
