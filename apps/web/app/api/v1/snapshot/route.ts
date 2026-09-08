/**
 * The funnel, its origin cohorts, and what could not be measured.
 *
 * The limitations array is not an afterthought: it is the field that lets a
 * caller tell a small answer from a small registry, and it is why every count
 * here can be read without knowing how our crawl works.
 */

import { readBoardView } from "@/lib/board";
import { gate, ok, preflight, serialise } from "@/lib/respond";
import { resolveChain } from "@bench/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function GET(request: Request) {
  const g = gate(request, { capacity: 60, windowMs: 60_000 }, "snapshot");
  if (!g.allowed) return g.response;

  const url = new URL(request.url);
  const { chainId } = resolveChain(url.searchParams.get("chain") ?? undefined);
  const view = readBoardView({ chainId, limit: 1 });

  return ok(serialise(view.snapshot), {
    block: view.snapshot.cutoff.block,
    observedAt: view.generatedAt,
    chainId,
  });
}
