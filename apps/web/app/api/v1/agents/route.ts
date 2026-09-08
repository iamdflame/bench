/**
 * The board, as data.
 *
 * Every row carries its rails, its track record, its freshness and — where a
 * rail is closed — the condition that closed it. That last field is the one
 * worth having: a directory API tells you what exists, and this one tells you
 * what you could actually do with it and why not.
 */

import { readBoardView, type Sort } from "@/lib/board";
import { fail, gate, ok, preflight, serialise } from "@/lib/respond";
import { RAILS, isJobSlug, resolveChain, type JobSlug, type RailName } from "@bench/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function GET(request: Request) {
  const g = gate(request, { capacity: 60, windowMs: 60_000 }, "agents");
  if (!g.allowed) return g.response;

  const url = new URL(request.url);
  const { chainId, coerced } = resolveChain(url.searchParams.get("chain") ?? undefined);
  const jobParam = url.searchParams.get("job");
  const railParam = url.searchParams.get("rail");
  const sort = (url.searchParams.get("sort") ?? "hireable") as Sort;
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  if (jobParam && !isJobSlug(jobParam)) return fail(`Unknown job "${jobParam}". The four are rebalancing, grid, yield and health.`);
  if (railParam && !(RAILS as string[]).includes(railParam))
    return fail(`Unknown rail "${railParam}". The three are call, hire and mandate.`);

  const view = readBoardView({
    chainId,
    job: (jobParam as JobSlug) ?? null,
    rail: (railParam as RailName) ?? null,
    sort,
    q: url.searchParams.get("q"),
  });

  const page = view.rows.slice(offset, offset + limit);

  return ok(
    {
      total: view.rows.length,
      offset,
      limit,
      collapsedByOrigin: view.collapsed,
      chainCoerced: coerced,
      rows: serialise(page),
    },
    { block: view.snapshot.cutoff.block, observedAt: view.generatedAt, chainId },
  );
}
