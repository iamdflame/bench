# The data pipeline

Every number this project publishes is a measurement of something, taken at a
time, by a run, from a source that could have refused. This document says which
— and where the pipeline is weaker than it should be.

---

## Observation boundaries

A figure without the moment it was taken is not a measurement. Everything below
carries its own boundary, and the ones that cannot are marked rather than
guessed.

| Figure | Boundary it carries |
|---|---|
| Attestations | The BSC block the valuation was read at, committed on chain before the outcome was known |
| Ladder rungs | The block the on-chain rungs were read at; the snapshot date for registry rungs |
| Agent index rows | `lastSeen` per row — the run that last refreshed it |
| Advantage Report | A single anchor block, fixed by a transaction *before* the run |
| Pool-gap scan | An explicit block range, printed at the top of every run |
| Greenfield objects | The block and price the breakdown was derived from |

Rung 3 on the ladder reads **"not measured"** rather than a number. Sweeping
capability across the registry needs the 8004scan Pro tier, and a plausible
figure there would be a lie of a particularly comfortable kind.

## Block-pinned reads

Anything assembled from several reads takes them at one height. A valuation
built from balances read at different blocks is not a measurement of anything:

```ts
// src/lib/chain/prices.ts
const blockNumber = await marketClient.getBlockNumber();
const [native, usdt, pool] = await Promise.all([
  marketClient.getBalance({ address: owner, blockNumber }),
  marketClient.readContract({ ...usdtBalanceOf, blockNumber }),
  readPool(WBNB_USDT_POOL),
]);
```

The Advantage Report goes further and reads every task's inputs at the anchor
block, using an archive provider where one will serve it. Where none will, the
run says so and the figure is marked, rather than silently reading `latest` and
presenting it as history.

## Deliberate exclusions

Stated, because an unstated exclusion is indistinguishable from an oversight.

| Excluded | Why |
|---|---|
| Incentive rewards from yield comparisons | A CAKE or XVS emission is a different asset with a different risk; folding it into an APR compares two things that are not comparable |
| Pools with fewer than 20 swaps, in the pool-gap scan | Turnover on a handful of trades is noise dressed as a signal |
| Agents whose card does not parse, from category counts | They are counted at rung 0 and excluded from classification, because there is nothing to classify |
| Our own operated agents, from registry rung counts | They are not ERC-8004 entries; counting them would mix two populations, and the ladder says so where they appear |
| Reverted transactions, from capability evidence | A reverted call emits no logs and demonstrates no capability |
| Feedback from wallets flagged as coordinated, from de-duplicated scores | Published beside the original, never silently substituted |

## Rate limits

8004scan allows **25 requests a minute anonymously**, 450 with the Pro tier.
At registry scale the limiter is the critical path, not the network, so it is a
single serialised queue with a minimum interval rather than a token bucket —
bursting simply moves the 429 later.

```ts
const RATE_PER_MIN = SCAN_API_KEY ? 450 : 25;
const MIN_INTERVAL_MS = Math.ceil(60_000 / RATE_PER_MIN);
```

- A `429` is honoured on its own terms: the response's `retry_after` is used,
  not a guessed backoff.
- `DATABASE_ERROR` from upstream is retried four times with exponential
  backoff. It happens under load and is not a permanent condition.
- Retries never re-enter the queue. An earlier version did, and a retry waiting
  behind the queue that contained it deadlocked the indexer.

**RPC providers are the harder limit.** Measured across thirteen public BSC
endpoints: most refuse `eth_getLogs` over any range, two serve archive state,
and which ones do *changes* — publicnode served ranged log queries when this
was written and now answers `Archive requests require a personal token` for
anything a few hours old. So every log path holds a provider list and tries
them in order, and **a window every provider refuses is recorded as a gap, not
as an empty result.** A missing log and an unreadable log are different claims
and only one of them is about the chain.

## The event indexer

Market events — settlements, dismissals, assays, observations — are read
directly from logs by `src/lib/career.ts`, `src/lib/ladder.ts` and
`packages/mandate-verify`. Each walks the range in provider-sized windows and
reports what it could not read.

This is honest and it does not scale. Past a few hundred mandates it wants a
subgraph or a persistent indexer, and the schema for one already exists in
`src/lib/db/schema.ts`.

## What is not true yet

- **Postgres is the source of truth, and the site still ships a snapshot
  fallback.** The worker had always written to Postgres and nothing had ever
  read from it, so the database was a write-only store and the site ran on a
  file. `readAgentIndex()` is the read path, `npm run db:seed` is the migration,
  and every page reports which source it used rather than leaving a reader to
  guess. The fallback is deliberate: it keeps the site deployable before any
  infrastructure exists and up when the database is not.

  Production now reads the database — `GET /api/v1/registry/funnel` reports
  `"source": "postgres"` — so this entry no longer belongs under a heading
  about what is not true. It is left here, corrected, because a note that
  quietly disappears once it stops being embarrassing is worth less than one
  that records having been fixed.

  The connection had to go through the IPv4 pooler: the direct Supabase host
  resolves to IPv6 only, and neither this machine nor the deployment target has
  a route to it.
- **The registry sweep is partial.** 3,808 of 303,391 agents have been fetched
  and parsed. That is a floor, not a total, and the ladder says so with a `≥`.
  Reaching the whole registry needs the Pro tier.
- **There is no subgraph.** See above.

Each of these is a missing instance or a missing key rather than a missing
design, and none of them is presented as working.
