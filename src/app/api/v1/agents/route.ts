/**
 * The register, as data. Filterable by rung and category.
 *
 * Returns what has actually been read, and says how much of the registry that
 * is. A caller must be able to tell a small answer from a small registry.
 */

import { readAgentIndex } from "@/lib/data/agents";
import { placeAgent, readMarketSets } from "@/lib/rung";
import { CATEGORIES, CHAIN_ID, type Category } from "@/lib/config";
import { fail, gate, ok, preflight } from "@/lib/api/respond";
import { live } from "@/lib/data/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = { capacity: 30, windowMs: 60_000 };
const MAX_LIMIT = 200;

export function OPTIONS() {
  return preflight();
}

export async function GET(request: Request) {
  await live();
  const g = gate(request, LIMIT, CHAIN_ID);
  if (!g.allowed) return g.response;

  const url = new URL(request.url);
  const rungParam = url.searchParams.get("rung");
  const categoryParam = url.searchParams.get("category");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const rung = rungParam !== null && /^[0-6]$/.test(rungParam) ? Number(rungParam) : null;

  /*
    An unrecognised filter is refused, not ignored.

    `?category=grid` used to fall through to `null` and return the whole
    unfiltered register, so a caller asking for grid agents got three hundred
    thousand rows of everything and no indication that their filter had been
    dropped. Silently widening a query is the worst of the three options: worse
    than an error, and worse than an empty page, because the caller believes
    the answer.
  */
  if (categoryParam !== null && !(CATEGORIES as readonly string[]).includes(categoryParam)) {
    return fail(
      400,
      `Unknown category "${categoryParam}". Valid categories are ${CATEGORIES.join(", ")}.`,
      CHAIN_ID,
    );
  }
  if (rungParam !== null && rung === null) {
    return fail(400, `Unknown rung "${rungParam}". Rungs run 0 to 6.`, CHAIN_ID);
  }
  const category = (categoryParam as Category | null) ?? null;

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
