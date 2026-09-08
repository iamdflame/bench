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

Last verified: 2026-09-08 15:30 UTC, at the block the snapshot names.

---

## Where it stands

| Phase | Built | Proven on mainnet | State |
|---|---|---|---|
| **P0** The spine | Route tree, `Measurement`/`Maybe`, board, four doors, ERC-8004 sweep, prober with the three-input check, B402 ingest | Funnel serves a block-stamped snapshot; 50 rows render with JavaScript off | **done** |
| **P1** Rail 1 — Call | `packages/rails/src/call.ts`, house agents answer 402 | **`rail-1-third-party`** — 0.01 USD1 paid to an endpoint we do not operate, tx `0x2e39…83ca`, block 120,590,203, six assertions. **11 third-party endpoints callable** after the false-timeout fix | **done** |
| **P2** Rail 3 — Mandate | `mandate.ts` + `session.ts`, `ProvenScope` enforced by an unexported symbol, `RecipientBound.sol` | **`rail-3-scope-holds` — 9 proven, 0 failed, 1 inconclusive** on mainnet. Wrapper [`0x5863eda…952e`](https://bscscan.com/address/0x5863edaede7394470db19395ca05b1439662952e) bytecode-matched; grant → in-scope permitted → out-of-scope refused by name → withheld selector refused → [revoked](https://bscscan.com/tx/0xbbeb10c6eb6d1d3d5d3de2cdc5da068007b1f5abf2608275f310df2ed325b087) → key unknown | **done** |
| **P3** Rail 2 — Hire | `hire.ts`, full ERC-8183 lifecycle, `disputeWindow()` read from chain, `prove-hire.ts` written | **`rail-2-escrow-funded` — 7 proven, 0 failed, 1 inconclusive** on testnet. Job 1139 FUNDED against a provider we do not operate; terms verbatim on chain; 1 $U escrowed | **testnet done, mainnet pending** |
| **P4** Counterfactual | — `packages/counterfactual` does not exist | — | **not started** |
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
