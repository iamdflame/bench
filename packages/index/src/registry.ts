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

  const [owner, uri] = await Promise.all([
    client
      .readContract({ address: registry, abi: IDENTITY_ABI, functionName: "ownerOf", args: [id], blockNumber: block })
      .catch(() => null),
    client
      .readContract({ address: registry, abi: IDENTITY_ABI, functionName: "tokenURI", args: [id], blockNumber: block })
      .catch(() => null),
  ]);

  let card: AgentCard | null = null;
  let cardRefusal: string | null = null;
  if (opts.withCard !== false && typeof uri === "string" && uri.length > 0) {
    const r = await fetchCard(uri);
    if (r.card) card = r.card;
    else cardRefusal = r.reason;
  } else if (!uri) {
    cardRefusal = "The registry does not return a tokenURI for this id.";
  }

  return {
    chainId,
    tokenId,
    registry,
    owner: (owner as Address | null) ?? null,
    tokenURI: typeof uri === "string" ? uri : null,
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
