/**
 * The register, as data. Filterable by rung and category.
 *
 * Returns what has actually been read, and says how much of the registry that
 * is. A caller must be able to tell a small answer from a small registry.
 */

import { readAgentIndex } from "@/lib/data/agents";
import { placeAgent, readMarketSets } from "@/lib/rung";
import { CATEGORIES, CHAIN_ID, type Category } from "@/lib/config";
import { gate, ok, preflight } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = { capacity: 30, windowMs: 60_000 };
const MAX_LIMIT = 200;

export function OPTIONS() {
  return preflight();
}

export async function GET(request: Request) {
  const g = gate(request, LIMIT, CHAIN_ID);
  if (!g.allowed) return g.response;

  const url = new URL(request.url);
  const rungParam = url.searchParams.get("rung");
  const categoryParam = url.searchParams.get("category");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const rung = rungParam !== null && /^[0-6]$/.test(rungParam) ? Number(rungParam) : null;
  const category =
    categoryParam && (CATEGORIES as readonly string[]).includes(categoryParam)
      ? (categoryParam as Category)
      : null;

  const [index, sets] = await Promise.all([readAgentIndex(), readMarketSets()]);

  const placed = index.agents.map((a) => {
    const place = placeAgent(a, sets);
    const wallet = a.owner?.toLowerCase() ?? "";
    const standing = wallet ? sets.standing.get(wallet) : undefined;
    return {
      tokenId: a.tokenId,
      name: a.name,
      owner: a.owner,
      category: a.category,
      confidence: a.confidence,
      endpointVerified: Boolean(a.endpointVerified),
      rung: place.rung,
      rungName: place.name,
      rungReason: place.reason,
      fineness: standing?.fineness ?? null,
      hallmarked: (standing?.fineness ?? 0) >= 375,
      bondWei: standing ? standing.bondWei.toString() : null,
      alphaBps: standing ? Number(standing.alphaBps) : null,
      lastSeen: a.lastSeen ?? index.capturedAt,
    };
  });

  const filtered = placed.filter(
    (a) => (rung === null || a.rung === rung) && (category === null || a.category === category),
  );

  return ok(
    {
      coverage: {
        registered: index.registry.registered,
        read: placed.length,
        // A caller must be able to tell "few agents match" from "few agents
        // have been read". Both numbers, always.
        unread: Math.max(0, index.registry.registered - placed.length),
      },
      filter: { rung, category, limit, offset },
      total: filtered.length,
      agents: filtered.slice(offset, offset + limit),
    },
    { chainId: CHAIN_ID, at: index.capturedAt },
    g.headers,
  );
}
