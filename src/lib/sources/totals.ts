/**
 * The registry's own totals, read live rather than carried in a snapshot.
 *
 * The headline sentence on the front door and rungs 0 and 2 of the ladder all
 * come from these two numbers, and both were being served out of a committed
 * file. The file said 303,391 registered; the registry said 304,787. A market
 * whose entire argument is that unverifiable figures are worthless cannot open
 * with a figure that is a day and a half old, and it certainly cannot lose a
 * freshness comparison to a competitor's census.
 *
 * Two properties matter here more than speed:
 *
 *   The upstream fails. 8004scan returns `DATABASE_ERROR` several times an
 *   hour, and a single attempt would leave the front door falling back to the
 *   snapshot on a coin flip. It is retried, briefly.
 *
 *   A fallback is never silent. When the live read does not land, the snapshot
 *   figure is served with `live: false` and the page says which it is showing.
 *   Serving a stale number is defensible; serving it as though it were current
 *   is the thing this product exists to catch.
 */

import { countAgents } from "@/lib/sources/scan";
import { memo, withTimeout } from "@/lib/cache";
import { db, hasDb, schema } from "@/lib/db/client";
import { and, eq, inArray } from "drizzle-orm";

export interface RegistryTotals {
  registered: number;
  withEndpoint: number;
  /** False when the upstream would not answer and the snapshot is standing in. */
  live: boolean;
  /**
   * Which of the three tiers answered.
   *
   * `upstream` is a count taken during this render. `indexer` is the count the
   * crawler recorded on its last cycle, which is minutes to an hour old and
   * far better than a file committed two days ago. Named rather than blended,
   * because a reader deciding whether to trust a figure needs to know which of
   * the three they are looking at.
   */
  tier: "upstream" | "indexer";
  /** When these figures were read. */
  at: string;
}

/**
 * Retries around an upstream that intermittently refuses.
 *
 * Three attempts, spaced far enough apart to clear a transient failure and
 * close enough together that a page render does not wait on them. Beyond that
 * the caller gets null and says so.
 */
/**
 * How long the upstream leg may take before the crawler's row stands in.
 *
 * Comfortably inside the caller's 2.5 second bound, so a slow 8004scan costs a
 * fresher figure rather than the whole reading.
 */
const UPSTREAM_BUDGET_MS = 1_600;

async function attempt<T>(fn: () => Promise<T>, tries = 2): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch {
      // Short, because the caller bounds the whole read at 2.5 seconds and a
      // long backoff spends that budget without ever reaching the answer.
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 250));
    }
  }
  return null;
}

/**
 * The crawler's last count, out of its own stats table.
 *
 * The indexer asks 8004scan for these three numbers at the top of every cycle
 * and records them. When the upstream refuses a page render — which it does
 * several times an hour — that recorded count is minutes old, and serving a
 * two-day-old file instead was throwing away the better answer.
 */
async function fromIndexer(chainId: number): Promise<RegistryTotals | null> {
  if (!hasDb || !db) return null;
  try {
    const rows = await db
      .select()
      .from(schema.stats)
      .where(
        and(
          eq(schema.stats.chainId, chainId),
          inArray(schema.stats.key, ["registered", "with_endpoint"]),
        ),
      );
    const registered = rows.find((r) => r.key === "registered");
    if (!registered) return null;
    return {
      registered: Math.round(registered.value),
      withEndpoint: Math.round(rows.find((r) => r.key === "with_endpoint")?.value ?? 0),
      live: false,
      tier: "indexer",
      at: (registered.capturedAt ?? new Date()).toISOString(),
    };
  } catch {
    return null;
  }
}

async function readTotalsUncached(chainId: number): Promise<RegistryTotals> {
  /*
    All three reads start together.

    The upstream and the crawler's row were tried in sequence, and the caller
    bounds this whole thing at 2.5 seconds so a cold instance cannot block a
    page. Two retries against a failing upstream spend that budget on their own
    backoff, so the fast local read that was meant to be the fallback never got
    to start — and every such render fell through to a file that was two days
    old while the answer sat in a table one query away.

    In parallel, the upstream still wins when it answers and the crawler's row
    is already in hand when it does not — but only if the upstream leg is
    itself bounded. `Promise.all` waits for the slowest branch, so running the
    fast local read alongside an unbounded retry loop still spent the caller's
    whole budget waiting for the branch that was failing, and still fell
    through to the file. The upstream gets its own, shorter deadline.
  */
  const [registered, withEndpoint, carried] = await Promise.all([
    withTimeout(attempt(() => countAgents({ chainId })), UPSTREAM_BUDGET_MS),
    withTimeout(
      attempt(() => countAgents({ chainId, isEndpointVerified: true })),
      UPSTREAM_BUDGET_MS,
    ),
    fromIndexer(chainId),
  ]);

  // A count of zero from an upstream that is failing is not a count of zero.
  if (registered) {
    return {
      registered,
      withEndpoint: withEndpoint ?? 0,
      live: true,
      tier: "upstream",
      at: new Date().toISOString(),
    };
  }

  /*
    Throw rather than resolve to null when every tier is silent.

    `memo` stores whatever the read resolves to, so returning null cached the
    failure for ten minutes: one unlucky render pinned the whole instance to
    the committed snapshot long after the upstream recovered. A rejection is
    not stored, so the next render tries again.
  */
  if (!carried) throw new Error("no registry total available from any tier");
  return carried;
}

/**
 * Memoised for ten minutes fresh, an hour stale.
 *
 * The registry grows by roughly a thousand entries a day, so a ten-minute-old
 * count is accurate to within a handful of registrations — and the alternative
 * is two calls against a 30-per-minute anonymous tier on every page render,
 * which is how the front door would start rate-limiting itself.
 */
export function readRegistryTotals(chainId: number): Promise<RegistryTotals> {
  return memo(
    `registry-totals:${chainId}`,
    { freshMs: 10 * 60_000, staleMs: 60 * 60_000 },
    () => readTotalsUncached(chainId),
  );
}
