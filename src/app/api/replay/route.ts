/**
 * The ladder at a past block, for the scrubber.
 *
 * A separate endpoint rather than a server render, because dragging a slider
 * should re-derive without reloading the page — and because the derivation is
 * the product here, it is worth being able to call it directly.
 */

import { ladderAt } from "@/lib/replay";
import { gate, fail, ok, preflight } from "@/lib/api/respond";
import { CHAIN_ID } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = { capacity: 30, windowMs: 60_000 };

export function OPTIONS() {
  return preflight();
}

export async function GET(request: Request) {
  const g = gate(request, LIMIT, CHAIN_ID);
  if (!g.allowed) return g.response;

  const raw = new URL(request.url).searchParams.get("block");
  if (!raw || !/^\d{1,12}$/.test(raw)) {
    return fail(400, "block must be a decimal block number", CHAIN_ID, g.headers);
  }

  try {
    const replay = await ladderAt(BigInt(raw));
    return ok(replay, { chainId: CHAIN_ID, blockNumber: raw, at: replay.at }, g.headers);
  } catch (e) {
    return fail(
      502,
      e instanceof Error ? e.message : "the ladder could not be re-derived at that block",
      CHAIN_ID,
      g.headers,
    );
  }
}
