/**
 * A job's metric definitions and its ranked board.
 *
 * The metric specs are served rather than described, so anyone building on
 * this can render the same columns with the same meanings — including a
 * competitor who wants to disagree with our numbers in public.
 */

import { readBoardView } from "@/lib/board";
import { fail, gate, ok, preflight, serialise } from "@/lib/respond";
import { isJobSlug, jobBySlug, resolveChain } from "@bench/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const g = gate(request, { capacity: 60, windowMs: 60_000 }, "job");
  if (!g.allowed) return g.response;

  const { job } = await params;
  if (!isJobSlug(job)) return fail(`Unknown job "${job}". The four are rebalancing, grid, yield and health.`, 404);
  const spec = jobBySlug(job)!;

  const url = new URL(request.url);
  const { chainId } = resolveChain(url.searchParams.get("chain") ?? undefined);
  const view = readBoardView({ chainId, job, limit: 100 });

  return ok(
    serialise({
      job: {
        slug: spec.slug,
        title: spec.title,
        line: spec.line,
        venues: spec.venues,
        authority: spec.authority,
        metrics: spec.metrics,
      },
      counts: view.snapshot.perJob[job],
      rows: view.rows,
    }),
    { block: view.snapshot.cutoff.block, observedAt: view.generatedAt, chainId },
  );
}
