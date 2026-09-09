/**
 * Agent standings, reconstructed from contract logs.
 *
 * The record is derived rather than reported, and that derivation is a walk of
 * `eth_getLogs` from the deploy block in 4,000-block spans — thirty-odd
 * sequential calls, because free BSC providers refuse anything wider. This
 * endpoint was uncached on the reasoning that serving a stale copy would
 * undercut the claim that the record is current.
 *
 * In practice it meant every visitor paid the whole walk, the request did not
 * return inside ninety seconds, and the panel on the floor read "Reading the
 * chain…" permanently. A section that never resolves is not more honest than a
 * cached one; it is just empty.
 *
 * So the walk is memoised and bounded. The answer carries the block range it
 * covers and whether it is complete, which is what actually protects the
 * claim — a reader can see how current it is rather than being asked to trust
 * that it is.
 */

import { readStandings } from "@/lib/chain/standings";
import { memo, withTimeout } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long enough for the walk on a warm provider, short enough to answer. */
const BUDGET_MS = 20_000;

const read = () =>
  memo("standings", { freshMs: 5 * 60_000, staleMs: 30 * 60_000 }, readStandings);

export async function GET() {
  try {
    const result = await withTimeout(read(), BUDGET_MS);
    if (!result) {
      return Response.json(
        {
          standings: [],
          complete: false,
          error:
            "The log walk did not finish inside the budget. This is a statement about the provider, not about the agents, and no standing is inferred from it.",
        },
        { status: 200, headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { standings: [], complete: false, error: String(error).slice(0, 200) },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
}
