/**
 * One listing, with every probe result behind it.
 *
 * Returns the same object the agent page renders from, so a caller reading
 * this API and a person reading the site cannot be shown different things.
 */

import { findRow } from "@/lib/board";
import { fail, gate, ok, preflight, serialise } from "@/lib/respond";
import { resolveChain } from "@bench/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chain: string; id: string }> },
) {
  const g = gate(request, { capacity: 60, windowMs: 60_000 }, "agent");
  if (!g.allowed) return g.response;

  const { chain, id } = await params;
  const { chainId } = resolveChain(chain);
  const hit = findRow(chainId, decodeURIComponent(id));
  if (!hit) {
    return fail(
      `This deployment has not read ${decodeURIComponent(id)} yet. That is a fact about the crawl's depth, not about the registry — see /api/v1/snapshot for how far it has reached.`,
      404,
    );
  }

  return ok(
    serialise({ row: hit.row, agent: hit.agent, service: hit.service }),
    { block: "0", observedAt: hit.row.probedAt ?? new Date().toISOString(), chainId },
  );
}
