# DRYRUN — Step-by-step build

Every step states: **what**, **why**, **files**, **exit test**. A step is done
when its exit test passes, not when the code is written.

Ordered by what unblocks the most downstream work.

---

# PHASE 0 — Make the machine run

Nothing else matters until something executes on a schedule and the board is
full. Four steps.

## Step 0.1 — Full-registry cursor walk

**What.** `packages/index/src/scan.ts` already talks to the correct host
(`api.8004scan.io/api/v1`) and that host supports everything needed for a
complete walk. It is only ever used for enrichment. Add a paginated walk.

Verified against the live API on 2026-09-09:

| Field | Value |
|---|---|
| `total` | `310,406` (chain 56) |
| `next_cursor` | present, base64 |
| `has_more` | boolean |
| `limit` max | `100` |
| Full walk | **3,105 requests** |
| Rate limit | 500/min with key, 25/min without |

**Why.** Turns `read: 257` into `read: 310,406`. This is the single highest-value
change in the whole plan and everything in Phase 1 depends on it.

**Files.** `packages/index/src/scan.ts` (new `walkAgents`), `worker/src/cli.ts`
(new `index` command), `packages/index/src/index.ts` (export).

**Exit test.** `npm run index -- --limit 500` writes 500 rows with distinct
`token_id`, and a full run reports a count within 1% of `total`.

## Step 0.2 — Persist the walk

**What.** A resumable, append-only store for the walk so a run can be stopped and
continued, and so a rate-limit does not lose an hour of work. Cursor checkpointed
to disk after every page.

**Why.** 3,105 requests is ~7 minutes at 500/min. It must survive a restart.

**Files.** `worker/src/store.ts`, `apps/web/data/`.

**Exit test.** Kill the walk halfway, restart it, and the row count continues from
where it stopped rather than from zero.

## Step 0.3 — Fix the scheduled runner

**What.** The most recent commit reads *"GitHub Actions is locked on this account,
so nothing scheduled has ever run."* Move the worker loop and the smoke suite to
Railway, which is already configured in `railway.json`. Publish the last-run
timestamp on `/data`.

**Why.** Every gate and every freshness claim is decoration until something
executes them on a clock.

**Files.** `railway.json`, `worker/src/index.ts`, `apps/web/app/data/page.tsx`.

**Exit test.** `/data` shows a last-run timestamp that advances without anyone
running a command locally.

## Step 0.4 — Keystore registration

**What.** `findRegistrationTx` in `packages/rails/src/session.ts` filters logs by
`address: account`. The Keystore is a separate contract at
`0x6572427ED530BadcF7375Cf9A4709D8d2b0E7E0a` — confirmed live on BSC mainnet
carrying 8,756 bytes of code. Try, in order:

1. Query logs against the Keystore address rather than the account.
2. Drive registration through the SDK's `grantSession` with registration enabled
   and capture the receipt's logs directly rather than searching afterwards.

**Why.** "Sessions registered in Keystore, so integration is read onchain" is an
explicit Altana requirement, and it is the only one we fail.

**Files.** `packages/rails/src/session.ts`.

**Exit test.** A granted session reports `registered: true` with a transaction
hash that resolves on BscScan.

---

# PHASE 1 — Turn 310,406 rows into a marketplace

## Step 1.1 — Resolve every declared endpoint

**What.** For each indexed row, resolve `tokenURI` → `data:` / `ipfs:` / `https:`
and extract the declared endpoint and card. Record the URI kind.

**Why.** Only ~1,186 of 310k declare a reachable endpoint. That ratio is the
product's headline and we must compute it ourselves rather than trust a flag.

**Exit test.** Every row carries a `uriKind` of `onchain-json | https | ipfs |
bare-label | empty`, and the counts sum to the total.

## Step 1.2 — Classify into the four jobs

**What.** `packages/index/src/classify.ts` exists and has tests. Run it across the
full set and store a rationale string with every verdict.

**Why.** 189 of 200 board rows currently carry `job: null`. Agent Diversity is the
criterion we fail hardest and this is the fix.

**Exit test.** `check:classified` passes — zero listed rows with `job: null` — and
per-category counts are published.

## Step 1.3 — Publish the origin clustering

**What.** `packages/index/src/origins.ts` already computes it and nothing shows
it. Measured today: `evoevo.ai` 141, `example.com` 40, `*.theaslangroupllc.com`
~200 across a dozen subdomains.

**Why.** It is the most interesting finding in the dataset and the honest reason
the hireable set is small. SMEAI ships clone detection; ours is better and hidden.

**Exit test.** `/` and `/data` both show the top origins with counts and shares.

## Step 1.4 — The funnel

**What.** Compute and expose: registered → declares endpoint → responds → payable
→ hireable → **never probed**. Expose at `/api/v1/funnel`.

**Why.** Marque's best idea. Converts our shallow crawl into an honesty feature.

**Exit test.** Stages sum correctly, each is clickable into the rows behind it,
and the numbers reproduce from a command printed on `/data`.

## Step 1.5 — Probe taxonomy with `degraded`

**What.** Extend the probe result from alive/dead to alive / degraded / dead /
never-probed, with latency.

**Why.** agentcensus found 347 degraded against 125 alive. "Degraded" is the true
state of most endpoints and we cannot currently express it.

**Exit test.** All four states appear in the board data with counts on `/data`.

## Step 1.6 — Provenance tags

**What.** Every rendered fact carries `declared | observed | onchain | derived`.
The `Measure` type already carries a method — widen it.

**Why.** trust8004's best idea, and it is the literal wording of Data Quality.

**Exit test.** `check:provenance` fails the build if any rendered figure lacks a tag.

## Step 1.7 — Tighten the diversity gate

**What.** `check:diversity` exists but passes on today's 5/18/16/8 spread. Make it
fail unless the four categories are within a stated ratio.

**Exit test.** The gate fails on today's data and passes after Step 1.2.

---

# PHASE 2 — The moat, widened

## Step 2.1 — Grid ladder replay
Extend the replay engine to simulate ladder fills against real swap events.
**Exit test.** A grid strategy replays over a real window and reports fills, fees and net.

## Step 2.2 — Yield rotation replay
Walk Venus/Lista rate history, drive rotation, charge real gas, compare against
sitting in the best pool at t=0.
**Exit test.** A published run with a command that reproduces it.

## Step 2.3 — Health-factor replay
Real Venus borrow position, walk the collateral price path, simulate top-ups at
the declared threshold vs doing nothing.
**Exit test.** Output states how close to liquidation each arm got and what defence cost.

## Step 2.4 — `/dryrun/[id]`
One address in, a verdict out, for all four categories. Pre-filled example so it
works before anyone types.
**Exit test.** A stranger pastes an address and gets four categories of answer.

## Step 2.5 — Multi-window distribution
Run N windows and publish the distribution rather than one number.
**Exit test.** Every replay figure carries a distribution, not a point estimate.

---

# PHASE 3 — The rails, completed

- **3.1** ERC-8183 escrow from testnet to mainnet, seller's submit-and-settle exercised
- **3.2** Fund each reference agent on its own Altana mainnet wallet
- **3.3** Seller-side x402 endpoint — be a merchant, not only a buyer
- **3.4** Sign quotes EIP-191 and verify against the agent wallet; kill `signed: false`
- **3.5** Offer `permit2-exact` alongside `eip3009` so USDT holders can pay
- **3.6** EIP-5792 batching so a hire is one popup

**Phase exit test.** Every category has ≥1 row with all three rails open
(`check:hireable`), and one full hire completes on mainnet with a counterparty.

---

# PHASE 4 — The face

- **4.1** Identity: ink ground `#0B1220`, mint signal `#5FE3C0`, Archivo + Source Serif 4, both themes
- **4.2** Homepage rebuilt around the funnel and four equal doors
- **4.3** The four `/j/[job]` templates made genuinely identical in depth
- **4.4** `/standard` — the published listing test
- **4.5** MCP surface with the four categories as a typed enum
- **4.6** Screenshot every room at 1440 and 360; no room ships unlooked-at

**Phase exit test.** A thumbnail of the homepage is not mistakable for any of the
twelve competitors.

---

# PHASE 5 — The submission

- **5.1** Agent Advantage Report: 3+ tasks both ways, outputs attached, ≥1 from trading/stock/security
- **5.2** Altana: wallet addresses, explorer links to real session transactions, the revoke
- **5.3** PancakeSwap: led by `RecipientBound.sol`
- **5.4** A judge's route — one URL that walks the whole proof in order
- **5.5** A recorded run of the full journey

---

## Progress

| Step | State |
|---|---|
| 0.1 Full-registry cursor walk | in progress |
| 0.2 Persist the walk | todo |
| 0.3 Fix the scheduled runner | todo |
| 0.4 Keystore registration | todo |
| 1.1–1.7 | todo |
| 2.1–2.5 | todo |
| 3.1–3.6 | todo |
| 4.1–4.6 | todo |
| 5.1–5.5 | todo |
