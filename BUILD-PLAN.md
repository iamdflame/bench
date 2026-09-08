# BUILD-PLAN — execution status against `PLAN.md`

**This file is status, not plan.** The plan is [`PLAN.md`](PLAN.md); this tracks how much of it
exists, phase by phase, using the plan's own P0–P8 sequencing. It replaced an earlier 13-step
tracker written against `restart.md`, which the new plan supersedes.

One rule governs every status word below, and it is the product's own rule turned on itself:

> **Code that runs is not a proof. A proof is an artifact on mainnet that anyone can re-derive.**

So each phase carries two columns. *Built* is what exists in the repository. *Proven* is what has
actually happened on chain 56 and is recorded in `apps/web/data/proofs.json` by a `prove-*` script
rather than by hand. A phase is only **done** when both are true, because a marketplace that
grades itself on lines of code is the failure mode in `PLAN.md` §3.

Last verified: 2026-09-08 17:35 UTC, at the block the snapshot names.

**Deployed: https://bench-six-sigma.vercel.app** — `npm run smoke` passes against it:
18 checks, every route, the reference agent answering 402 on chain 56, 50 rows rendering with
JavaScript off, and nothing animating on arrival.

---

## Where it stands

| Phase | Built | Proven on mainnet | State |
|---|---|---|---|
| **P0** The spine | Route tree, `Measurement`/`Maybe`, board, four doors, ERC-8004 sweep, prober with the three-input check, B402 ingest | Funnel serves a block-stamped snapshot; 50 rows render with JavaScript off | **done** |
| **P1** Rail 1 — Call | `packages/rails/src/call.ts`, house agents answer 402 | **`rail-1-third-party`** — 0.01 USD1 paid to an endpoint we do not operate, tx `0x2e39…83ca`, block 120,590,203, six assertions. **11 third-party endpoints callable** after the false-timeout fix | **done** |
| **P2** Rail 3 — Mandate | `mandate.ts` + `session.ts`, `ProvenScope` enforced by an unexported symbol, `RecipientBound.sol` | **`rail-3-scope-holds` — 9 proven, 0 failed, 1 inconclusive** on mainnet. Wrapper [`0x5863eda…952e`](https://bscscan.com/address/0x5863edaede7394470db19395ca05b1439662952e) bytecode-matched; grant → in-scope permitted → out-of-scope refused by name → withheld selector refused → [revoked](https://bscscan.com/tx/0xbbeb10c6eb6d1d3d5d3de2cdc5da068007b1f5abf2608275f310df2ed325b087) → key unknown | **done** |
| **P3** Rail 2 — Hire | `hire.ts`, full ERC-8183 lifecycle, `disputeWindow()` read from chain, `prove-hire.ts` written | **`rail-2-escrow-funded` — 7 proven, 0 failed, 1 inconclusive** on testnet. Job 1139 FUNDED against a provider we do not operate; terms verbatim on chain; 1 $U escrowed | **testnet done, mainnet pending** |
| **P4** Counterfactual | Engine, worker run on `/data`, **and per-position replay on `/a/[chain]/[id]?position=0x…`**. `no-lookahead` gate, 5 tests | 18,911 swaps published; and a real position (#7380336) replayed live against 1,971 swaps of its own pool | **done for reading; acting is Rails 2 and 3** |
| **P5** Depth | Four job routes off one template, `/data`, `/register`, `/list`, `/api/v1/*`, `/api/mcp`, own agent card, origin cohorts | Four findings recorded, all measurements block-stamped | **partial** |
| **P6** `OutcomePolicy` | — only `RecipientBound.sol` is in `contracts/src` | — | **not started** |
| **P7** Supply and usage | — no Studio on-ramp, no seller dashboard | — | **not started** |
| **P8** Polish | Motion layer, footer, stat strip, mobile to 360px, seven gates green | Smoke green against a running deployment | **ongoing** |

### What is actually proven

One proof and four findings. That is the honest total, and the plan is right that it is the number
that matters:

- `rail-1-third-party` — a stranger's agent, paid, on mainnet, for a cent.
- `b402-network-mismatch` — 979 listings for BNB Chain, 941 answering with a Base challenge, 4
  payable here.
- `eip3009-on-bsc` — neither BSC USDT nor USDC implements it; USD1 and $U are the only options.
- `log-retention` — one public endpoint serves ranged `getLogs`, and only at the head.
- `8004scan-degraded` — the index returns `DATABASE_ERROR` on most page sizes, so the chain is read
  first and the index used only for enrichment.

---

## Where the new plan and the repository disagree

These are decisions, not bugs. Each needs a ruling before the phase that touches it starts.

| # | The plan says | The repository has | Recommended resolution |
|---|---|---|---|
| 1 | §17: **four** reference agents, one per category | **eight** — two per category (`range-keeper-i`/`-ii`, and the same for grid, yield, health) | Keep eight. The second of each pair is what makes a per-job comparison non-trivial, and the `diversity` gate already holds all four categories equal. Amend §17 rather than delete four agents. |
| 2 | §11: `/api/a2a` as a distinct machine surface | One endpoint, `/api/mcp`; the agent card points `a2a_endpoint` at it and says why | Keep one endpoint. Both protocols are JSON-RPC over POST, and declaring two that are one is the kind of claim this product refuses. Amend §11. |
| 3 | §18: a `no-lookahead` CI gate | Nine gates, no `no-lookahead` | Build it with P4. It cannot be written before the engine it guards exists. |
| 4 | §15 rung 7: B402 `l30DaysUniquePayers` > 0 | Measured: the public discovery API serves only `resource`, `type`, `x402Version`, `description`, `accepts`, `lastUpdated` | **The rung is unobtainable as written.** Either derive payer counts from settle logs ourselves, or restate the rung as `lastUpdated` freshness and say so. Recorded as an editor's note in `PLAN.md` §7.2 and §15. |
| 5 | §7.2(a): "it already publishes `fail_rate_24h`…" | Same measurement as above | Same note. The claim is true of Binance's documentation and false of the wire. |
| 6 | §18: Postgres + Drizzle | A file-backed store in `worker/src/store.ts` | Defer. Postgres buys nothing until the outcome ledger (§9) needs it, and the store is behind an interface. |

---

## The critical path from here

In the plan's own dependency order, not in the order of what is pleasant to build:

1. **Run `prove-scope` on mainnet.** The wrapper is already deployed (below), so what is missing
   is the exercise: grant → in-scope → out-of-scope refused → revoke → dead. §21 artifacts 2 and 3
   sit behind this one run, and it is the single highest-value hour available.
2. **Close Rail 2 on testnet** (900s dispute window), then fund a mainnet job early enough that it
   settles inside the judging period. §21 artifacts 5 and 6.
3. **`packages/counterfactual`**, with the `no-lookahead` gate written alongside it. This is the
   plan's stated single most important thing and nothing of it exists yet.
4. **Resolve rung 7** one way or the other, so the trust ladder has no rung that can never light.

Anti-drift rule 2 from §24 applies to all of it: **no design work while a rail is incomplete.**
Two of three rails are unproven.

---

## Gates

Nine checks. Seven run in the build, `smoke` runs against something serving, `budget` measures the
shipped bundle. Last full run, 2026-09-08 15:36 UTC, all green, plus 42 unit tests:

```
ranking PASS · absence PASS · measurement PASS · network PASS
diversity PASS · routes PASS · motion PASS

smoke:  ok 13 routes serve, including /.well-known/agent-card.json
        ok a reference agent answers 402 with a payable challenge on chain 56
        ok the funnel is 3m old, at block 120,711,019
        ok 50 board rows render with JavaScript off
        ok nothing animated on arrival, and 200 live values recorded as baseline
        ok 50 changed values rolled, and none of the unchanged ones did

budget: every read path is within a few KB of the shared baseline
```

`no-lookahead` is the tenth and does not exist yet; see divergence 3.


---

## The `RecipientBound` deployment, verified

Recorded here because the tracker previously claimed the opposite. `RECIPIENT_BOUND` is set in
`.env.local` (not `.env.example`, which is where the wrong reading came from), and the contract
at that address is live on chain 56.

| | |
|---|---|
| Address | `0x5863edaede7394470db19395ca05b1439662952e` |
| Runtime bytecode | 5,221 bytes on chain, 5,221 in `contracts/out` |
| Match | **exact**, with the eight immutable slots masked out |
| `principal` | `0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90` |
| `agent` | same address — correct under an Altana session, where the call executes from the principal's own smart account |
| `positionManager` | `0x46A15B0b27311cedF172AB29E4f4766fbE7F4364` — PancakeSwap V3 |
| token pair | USDT `0x55d3…7955` / WBNB `0xbb4C…095c` |
| cap | 0.05 BNB, both slots |
| `expiry` | 1823423782 → **2027-10-13**, so it is live, not lapsed |

The comparison masks the immutable regions using `deployedBytecode.immutableReferences` from the
Foundry artifact, which is why a naive byte comparison reports a mismatch on a contract that is in
fact identical: immutables are written into the runtime code at construction, and the artifact
carries zeros in their place.

**Still outstanding for §21 artifact 4:** source verification on BscScan. `SCAN_BASE_URL` points at
8004scan, which is an agent index and does not serve `getsourcecode`, so verification needs a
BscScan API key that this environment does not have.


---

## Correctness pass, 2026-09-08

Work done against critical-path item 1. It did not reach `prove-scope` on mainnet, because
attempting it surfaced four defects that had to be fixed first — three of which meant the rail
could not have produced an honest proof even if it had run. All four are recorded as findings on
`/data` rather than fixed quietly, and all four were found by trying to execute the plan rather
than by reading the code.

### 1. `ProvenScope` could not be constructed — Rail 3 could not run at all

`packages/rails/src/mandate.ts` branded the type with `declare const witness: unique symbol`, which
exists only in the type system. The object literal wrote `[witness]:` as a real key, so `scopeFor`
threw `ReferenceError: witness is not defined` on its first call. It type-checked perfectly.

Fixed by making `witness` an actual unexported `Symbol`, which keeps the compile-time guarantee —
nothing outside the module can name it — and also exists at runtime, where the grant happens.

### 2. viem silently discarded every topic filter — `granted ⊆ proven` did not hold

The most serious of the four. `scanLogs` passed a raw `topics` array to viem's `getLogs`, which
builds its filter from `event`/`events` and **drops a bare `topics` property**. The call site had
cast it `as never`, suppressing the type error that would have named the problem.

Measured on Venus vUSDT over 900 blocks: **570 logs unfiltered, 570 logs with
`topics: [null, walletTopic]`, 0 from the identical filter over raw JSON-RPC.**

The consequence was not a slow query but a false one. The capability scan matched every event on a
contract instead of the events naming the wallet, and so "proved" that our own principal had used
all four job venues inside 68 minutes — on the strength of two strangers' transactions. Both were
checked: neither was sent by the wallet, and neither contains a single log naming it in any topic.
Rail 3 derives standing authority over money from exactly that evidence.

`scanLogs` now issues `eth_getLogs` itself. With the filter actually sent, the same scan returns
zero evidence and the rail refuses to grant — which is the correct answer.
`packages/shared/src/__tests__/client.test.ts` asserts on the JSON-RPC body that leaves the
process, because a filter that is dropped rather than rejected passes every downstream check.

### 3. The log window was three limits wearing one name

The recorded `log-retention` finding attributed every refusal to the block range. Re-measured, it
is three separate things:

| Limit | What it is | Right response |
|---|---|---|
| `query exceeds max results 20000, retry with the range A-B` | A result-count cap — **and the provider hands back the range that would have worked** | Follow the hint |
| `ResponseBodyTooLargeError … 10485760 bytes` | viem's own 10 MB client cap, hit before the result cap on busy pools | Halve the span |
| `Archive requests require a personal token` | The wall: logs served for ~10,000 blocks (**about 75 minutes**), nothing older at any span | Stop, and say so |

`scanLogs` is now an adaptive walker that follows the hint, halves on body size, and reports the
wall as a distinct fact with `servedFrom` and a `refused` list. A 5,000-block scan across all five
liquid pools now returns **41,293 logs, complete** — it was a hard refusal before.

The capability scan's `DEFAULT_LOOKBACK` was 400,000 blocks, forty times what any public host will
serve, so it spent eighty requests being refused and then reported an incomplete scan — which Rail
3 correctly treats as unknown and refuses to act on. **The rail was never broken; it was being fed
a window that could never be filled.** The lookback is now `hasArchive() ? 400_000n :
PUBLIC_LOG_WINDOW`, and the window text says which it is.

### 4. Block time was 67% wrong, which corrupted every annualised figure

`BLOCK_SECONDS` was `0.75`. Measured across spans of 1k, 100k, 1M and 5M blocks, BSC produces a
block every **0.450s**, identical to three decimals at every span. The constant converts days into
block spans and blocks into years, so it scaled every observation window and the `blocksPerYear`
denominator of the net APY that yield agents are ranked by. A number wrong by a constant survives
every sanity check, which is why it lasted.

### 5. The board reported eleven live endpoints as dead, including one we have a receipt for

Found while regenerating the board data. A full sweep of all 979 B402 listings recorded
`endpoint-timeout` against 60 of them — among them `mpp.hyreagent.fun/bsc/defi/tvl`, the endpoint
this marketplace **paid 0.01 USD1 on mainnet earlier the same day**, transaction on chain. Called
on its own it answered a valid chain-56 USD1 challenge three times running, in 0.5s, 1.1s and 3.2s.

The cause was our own scheduling: that host serves eleven of the catalogue's listings and each
probe makes three further requests for the identity check, so a pool bounded at twelve still queued
a dozen calls at one origin. `probeEndpoint` now retries a timeout once, serially, at double the
patience, before a timeout becomes a verdict.

**Callable went from 0 to 11**, and the board is now consistent with the one payment this
marketplace can prove it made — at exactly the price it paid.

A refusal has to be a fact about the agent, not about us. This is the same class of error as the
topic filter, pointing the other way: quiet, plausible, and wrong in the direction that makes our
own page look decisive.

### 6. There is free archive access, and the finding that said otherwise measured our own bugs

The most consequential correction of the pass, because it reversed a conclusion that had been
written into the plan's risk register.

Twenty-one public BNB Chain endpoints were re-tested with a filtered `eth_getLogs` at 1k / 100k /
1M / 5M blocks back. **`bsc.rpc.blxrbdn.com` answered at every depth tried, out to 40,000,000
blocks — 208 days — in 200-900ms**, capping a request at a clean 5,000 blocks. `rpc-bsc.48.club`
served to 1M but sits behind a Cloudflare edge that refuses connections from here, so it is not
listed. Everything else refused, in eight distinguishable ways.

The earlier "one host, head window only" reading was taken with a walker that **sent no topic
filter and read a result-count cap as a range refusal**. It was measuring its own defects and
calling the chain the problem. That is the exact failure this marketplace exists to prevent in
other people's data, committed in ours.

What it unblocked, immediately:

- The capability scan completes a **400,000-block (2.1 day) window in 61 seconds, `complete=true`**.
- A wallet the chain shows using PancakeSwap V3 now derives **4 calls granted, 8 withheld**.
- **P4 is not blocked on a paid provider.** A 30-day replay is 5.76M blocks ÷ 5,000 = ~1,152
  requests, minutes of wall time, and precomputable per pool exactly as §25 prescribes.

### 7. `prove-scope` could not prove scope, and said so

With the scan working, `prove-scope` ran on mainnet for the first time. Three sessions were granted
and revoked for real; the revocations are on chain. It reported **6 proven, 0 failed, 4
inconclusive** — and the four were the ones that matter: in-scope allowed, out-of-scope refused,
withheld selector refused, revoked call fails.

The cause was in the script. The in-scope baseline computed
`signature.slice(0, indexOf("("))` — the function **name**, `"mint"`, cast `as Hex` — and then
discarded that object and sent `data: "0x"` instead. So the baseline exercised no selector at all,
and every comparison was drawn against it. Fixed to send a real `toFunctionSelector`, and the
out-of-scope probe now carries a valid selector too, so the only variable is whether the target was
granted.

**The rail had been right the whole time.** Reading one raw relay error settled it. Porto's
`shortMessage` is the constant string *"An error occurred while executing calls."* for every
outcome, and `classify()` read `shortMessage ?? details` — so it never saw the field that
discriminates. In `details` was:

```
UnauthorizedCall(UnauthorizedCall { keyHash: 0xe0551dd9…,
  target: 0xfd36e2c2a6789db23113685031d7f16329158384, data: 0xb0772d0b })
```

The Altana account naming the exact target and the exact four bytes it refused. Two more reading
errors sat behind it: an in-scope call returns an empty `0x` revert — the *target* rejecting bare
calldata, which is the opposite of a policy refusal and had to become its own `reverted` kind — and
a revoked key reports as `key hash 0x… is unknown`, which the obvious pattern `unknown key` does
not match.

**P2 now scores 9 proven, 0 failed, 1 inconclusive** and is recorded as the proof
`rail-3-scope-holds`. The one inconclusive is KeyStore registration: no `Authorize` log is found,
so it is reported as unregistered. That is genuinely unproven rather than a reporting artefact —
the session enforces identically either way, but registration is what would let a counterparty
verify the scope without asking us.

### 8. The engagement store could claim a session the chain never had

Found while cleaning up. A grant is two things — a local record and a key on the account — and a
run killed between them leaves the record alive while the key never existed. `revokeEngagement`
then answers `KeyDoesNotExist`, and `isLive` went on reporting a live session: `/desk` telling
someone they have authority outstanding that nobody ever had.

Now marked `orphanedAt` rather than `revokedAt`, and `isLive` honours it. The distinction is the
point: *we ended it* and *it never began* are different facts, and only one of them has a hash.


## Rail 2, and four things that were wrong because nobody had run it

`npm run prove-hire` had been advertised in `package.json` for the life of the
rail, pointing at a file that was never written. Writing it found the rest.

**1. Every signature in `COMMERCE_ABI` was wrong.** `createJob` took three
arguments instead of five and in a different order; `setBudget` and `fund` were
missing their trailing `bytes`; and `registerJob` was addressed to the kernel
when it lives on the router. Five intents, five selectors the chain has never
heard of. The plan would have reverted on its first call.

**2. The Altana SDK ships a policy address the network does not use.**
`@altananetwork/sdk@0.7.1` reports chain 97's policy as `0x4F4678D4…78A6`. That
contract is deployed, answers `disputeWindow()` with 86,400 — and no job on the
network is registered against it. Every live `registerJob` in the last four
thousand blocks names `0xd6a42175…1cEA`, whose window is **900 seconds**.

The failure is silent and total: `registerJob` reverts with an unnamed custom
error, so the policy is never bound, so `fund` reverts with `PolicyNotSet()`
and the escrow can never be filled. Nothing in either error says "wrong
policy". Found by scanning the router's own logs for a `registerJob` that
worked and reading the address out of its calldata.

**3. This corrects a correction.** Earlier the same day this tracker recorded
testnet's dispute window as 24 hours and marked the plan's 900 seconds as
wrong. **The plan was right.** The 24 hours belonged to a contract nobody uses.
When a constant and the chain disagree, the chain is the constant — and that
applies to a constant in the SDK exactly as much as to one in the plan.

**4. `/data` assumed every proof was a payment.** A proof carrying a revocation
and no amount crashed the build. It now renders what each proof actually holds,
and an inconclusive assertion renders dim rather than as a failure.

### What P3 still owes

- **Mainnet.** The window there is 604,800 seconds read from the policy, so a
  mainnet job has to be funded early enough to settle inside the period someone
  is watching.
- **A deliverable.** The buyer's half is exercised end to end. The seller's
  `submit(uint256,bytes32,bytes)` on the router and the settle-or-dispute
  branch are not, because that needs a counterparty who wants the money.


## Deploying it, and three things that only fail in production

The site is on Vercel. Nothing about getting it there was interesting except
the parts that were invisible locally.

**`"next": "*"` resolves to next@7.0.2-canary.49.** npm workspaces hoists the
root's `^15.5.25` locally, so a wildcard in `apps/web/package.json` is
indistinguishable from a pin — until Vercel installs that package on its own
and npm picks a 2018 canary off the registry. The build then reports "legacy
mode" and dies looking for a `pages` directory. Third-party dependencies of a
deployed workspace package are pinned now.

**A build under a root directory cannot see the repository's devDependencies.**
`@tailwindcss/postcss` and `tailwindcss` (the postcss plugin) and `typescript`
plus `@types/*` (`next build` type-checks) all lived at the repo root and were
simply absent. What a build needs is declared where it is used.

**The deployment was behind Vercel's SSO wall, and every route answered 200.**
That 200 was the login page. It is exactly the failure this plan names in §22
about a competitor — a paid path closed at admission, so a machine buyer
literally cannot hire — and we shipped it ourselves for twenty minutes.
Protection is off; `/api/agents/range-keeper-i` answers 402 to anyone.

The lesson is the same one the log walker taught: a check that cannot fail is
not a check. Thirteen routes returning 200 told us nothing until one of them
was asked to return something other than 200.


## P4 — the counterfactual engine

The plan calls this the single most important thing in the document, and it was
blocked on an archive host that turned out to exist all along. `packages/counterfactual`
now replays a strategy against a pool's real price series.

| File | What it does |
|---|---|
| `history.ts` | Walks the pool's own `Swap` events into a price series. PancakeSwap's `Swap` has **nine** fields, not Uniswap's seven, so the topic is derived from the signature rather than pasted — a wrong topic matches nothing and reads exactly like a quiet pool. |
| `simulate.ts` | Position value and **fee accrual computed from the swap**: `fee × amount × (our liquidity ÷ pool liquidity)`, every term out of the event. No assumed APR. |
| `cost.ts` | Gas at the chain's price, and slippage bounded by the pool's in-range depth at that block. |
| `replay.ts` | The loop. A strategy is handed one `Tick` by value and never the series. |
| `strategies.ts` | Three keepers and a do-nothing arm. |

**Verified against mainnet**: 4,954 swaps over five hours on WBNB/USDT, `complete=true`,
served by the archive host in about twelve seconds.

### What the first real replay said

On a five-hour window with a ±60-tick opening band:

| | in range | recentres | net vs open |
|---|---|---|---|
| Hold | 74.3% | 0 | **+7.08 USDT** |
| Range Keeper I | 100% | 1 | −2.06 |
| Range Keeper II | 100% | 1 | −1.68 |
| Tight Band Keeper | 100% | 2 | −0.88 |

**All three keepers lose to doing nothing.** Every one of them holds the price in
range where holding does not, and every one is worse off, because the swap
needed to recentre costs more than the extra fee capture is worth over five
hours. That is the number the plan exists to surface — rule 5.5.5, losses shown
at the same weight — and an engine that could not produce it would be a
brochure.

### Three bugs the first run found

1. **`chargeRecentre` charged for a swap it never performed.** It returned
   `amount0` untouched and took a fee off `amount1`. A position that had gone
   out of range is held entirely in one token, so minting a band around the
   current price found almost no liquidity on the other side and a single
   recentre appeared to destroy the whole position — −1,890 USDT on a 1,900 USDT
   position. The cost model was right; the mechanics were missing.

2. **Gas was free.** BSC reports `baseFeePerGas` as **0** — it prices gas through
   `eth_gasPrice`, not the header. Reading the header alone makes every action
   cost nothing, which hands the win to whichever strategy churns hardest. That
   is the precise failure the cost model exists to prevent, arriving through the
   back door.

3. **The engine had no way to mint a two-sided position** from one token, which
   is correct behaviour and was worth confirming rather than patching.

### The gate has teeth

`no-lookahead` corrupts every tick after a cut, replays, and fails if any earlier
decision moved. It passes — but a gate that cannot fail is decoration, so
`packages/counterfactual/src/__tests__/replay.test.ts` builds a strategy that
cheats the way a real cheat would (a closure over the series, captured before
the replay) and asserts the detection catches it. Five tests, all passing.

### What P4 still owes

- **It is not on any page.** The engine runs from a script. The board's "for your
  position" column and the agent-page headline are not built.
- **Nothing reads a viewer's real position.** The replay takes a synthetic
  opening band; connecting a wallet and replaying against a position somebody
  actually holds is the next step and the one that makes it a product.
- **One window, one pool.** A thirty-day replay is ~1,152 requests and belongs on
  a schedule, cached by `(pool, blockRange)`, not in a request path.


## P4 on the page

`npm run counterfactual` replays the reference strategies in the worker and stores
one record; `/data` renders it. One record rather than one per agent, because
every row has to have been replayed over the same window against the same
opening position or the column is not a column.

The published run — 18,911 swaps, 24 hours, every range served:

| | in range | recentres | net | vs doing nothing |
|---|---|---|---|---|
| Hold | 29.5% | 0 | +0.52 | — |
| Range Keeper I | 100% | 1 | +10.40 | **+9.88** |
| Range Keeper II | 100% | 1 | +14.53 | **+14.01** |
| Tight Band Keeper | 100% | 9 | −6.28 | **−6.80** |

This is the shape §5.1 of the plan drew by hand, arrived at from chain data:
the patient keepers win, and the impatient one **holds the price in range as
well as anything above it and still finishes 6.80 behind doing nothing**, across
nine recentres. Time in range is not money. That row is what makes the other two
worth reading.

### The caveat that matters more than the result

The same replay run eight minutes earlier — a window shifted by a few hundred
blocks — had **every** strategy losing, Range Keeper II at −5.73 rather than
+14.01. Which side of a band the price sits on when the clock starts decides
when a recentre fires and what it costs.

So the page says, in its own copy, that this is one window and not a track
record. Publishing a single replay as a forecast would be a brochure wearing
arithmetic, which is worse than a brochure. A record is many of these, and
accumulating them is what §9's outcome ledger is for.

### One more thing the run corrected

`token0Symbol` was derived by splitting the pool's label on "/" and taking a
side. `LIQUID_POOLS` calls one pool "WBNB/USDT" while its `token0` is USDT, so
that was right for this pool by coincidence and wrong for the next one. It now
resolves the symbol from the token address. The label is for a reader; the
address is the fact.

### What P4 still owes

**Nothing reads a viewer's own position.** The opening position is synthetic — a
stated amount in a stated band — and the page says so in the copy rather than in
a comment. Replaying against a position somebody actually holds needs a wallet
connection, and that is the step that turns this from a measurement into the
product the plan describes.


## The counterfactual answers for a position somebody actually holds

`/a/[chain]/[id]?position=0x…` reads the address's PancakeSwap V3 positions off
chain, picks the largest, and replays every reference strategy against **that**
band, that liquidity and that pool's real swaps.

### An address, not a wallet connection

Reading a position needs an address; only *acting* needs a signature. So this is
a plain GET form. It works with JavaScript off, adds nothing to the client
bundle, and asks the reader for nothing they would be right to refuse. The plan
says "connect a wallet"; a connector here would have bought a nicer paste and
cost the read path, and it would not have made the answer truer.

### Streamed, because it is slow and says so

Walking a busy pool takes seconds, and a hire screen that blocks on a log walk
is how one times out mid-scan and refuses for the wrong reason. The replay sits
in a Suspense boundary: **first byte 39ms**, the page is complete and readable
immediately, and the table arrives when the chain has been read. Repeat views
are 1.5s from an in-process cache keyed by `(pool, block window, position)`.

Two hours of a busy 1% pool took **32 seconds** cold, so the window is an hour —
measured, not picked. That lands at **first byte 0.20s, complete in 6.2s**, and
the copy on the page reports the window it actually got rather than the one it
asked for.

### What the first real position said

Position #7380336, a 3,200-tick band on a 1% pool, against 1,971 real swaps:

| | in range | recentres | vs holding |
|---|---|---|---|
| Hold | 66.8% | 0 | — |
| Range Keeper I | 97.6% | 8 | −114.65 |
| Range Keeper II | 95.3% | 31 | −268.90 |
| Tight Band Keeper | 93.6% | 125 | −644.07 |

**Every agent would have destroyed value on this position**, monotonically with
how often it acted. The page says so in words: *"that is a real answer to
'should I hire one of these for this position', and it is no."*

A marketplace that cannot tell somebody not to buy is a shop. This is the first
screen in the product that can.

### What it still owes

- **The board's per-row column.** §5.6 wants the figure on every row of `/` once
  an address is known; today it is the agent page only.
- **Rail 3's own agents.** The three keepers are reference strategies. A
  third-party agent has no replayable strategy object, so its row cannot be
  replayed — only measured after it is hired, which is §9's ledger.
