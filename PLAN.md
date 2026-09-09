# DRYRUN — Rebuild Plan

*See what an agent would have done to **your** money — before you pay it a cent.*

The plan to take the $30,000 main prize, the Altana track and the TermiX track,
and to win them by a margin that is not arguable.

- **Was:** BENCH — not in the top 15
- **Keeps:** the proof engine
- **Burns:** brand, frontend, data layer, indexer
- **Deadline:** explicitly ignored

---

## 1. Why it is not in the top fifteen

Not a quality problem. A shape problem.

BENCH has the best measurement engine in this hackathon attached to the emptiest
shop floor in it. Judges do not read your engine. They land on your homepage, and
your homepage says the shelves are bare.

| Measured | Value |
|---|---|
| Hireable per category | **2** |
| Board rows unclassified | **189 / 200** |
| Registry read | **257** of 310,318 |
| Rows marked hireable | 0 |

From the live API: `/api/v1/snapshot` reports `registered: 310,318` against
`read: 257`. `/api/v1/agents` returns 200 rows of which **189 carry `job: null`**
and **every one carries `hireable: null`**. Each of the four job cards shows `2`.

The first four rows on the board are our own agents — Grid Runner I/II, Health
Shield I/II — each with "not measured" as its track record. A judge scoring
**Data Quality** and **Agent Diversity** sees an empty marketplace selling four
house agents with no record.

### The competitors have the inverse problem

- **Marque** indexes 298,817 agents and cannot hire one (`charters/active` = `[]`)
- **trust8004** has 1,936 commits whose four flagship agents are all `marketplace-operated-*`
- **SMEAI** probes 303 endpoints and gates its own hire path

**Nobody has both supply and proof.** That gap is the whole opportunity.

---

## 2. The unlock

We crawl the registry backwards from the chain head — hence 257 of 310,318.
8004scan already has the whole thing indexed, and the hackathon grants entrants
Pro tier: **500 req/min, 100,000/day**.

| Fact | Value | Consequence |
|---|---|---|
| Total agents, chain 56 | `310,387` | The denominator, handed to us |
| Pagination | cursor + page | Fully walkable, stable ordering |
| At `limit=100` | ~3,104 requests | **Under 10 minutes** for the whole registry |
| Daily quota | 100,000 | Re-index 32x/day and stay inside it |
| Fields | `x402_supported`, `health_score`, `total_score`, `rank`, `is_verified`, `supported_protocols`, `total_feedbacks` | Pre-filter the paid-callable set |

**257 rows becomes 310,387, and it is an afternoon of work.**

---

## 3. The thesis

> Every other entry tells you an agent *exists*. DRYRUN shows you what that agent
> *would have done to the position you actually hold*, replayed against the pool's
> own history, before you give it a cent — and then lets you hire it three ways,
> each with a smaller blast radius than the last.

The rubric defines Data Quality as "real-time, accurate data that goes beyond
basic counts… a genuinely informed call on which agent to hire." That is a
description of a counterfactual replay. We already built one. **No other entry in
the field has anything like it.**

DRYRUN is not a directory. It is the **proving ground** — where an agent earns
its listing, and where a buyer rehearses a hire against their own money for free.

---

## 4. Name and mark

**DRYRUN.** One word, names the mechanic no competitor has, survives out of
context. Kills the collision with `Ritapossible/Bench` (confirmed entry #32).

Runners-up: PROVING GROUND, CRUCIBLE, PRECEDENT.

The three ascending bars survive the rename — teal, gold, ember — because they
encode the product: three rails in ascending order of what you give up. It now
reads as a dry-run trace stepping up.

- **Teal — Call it.** You give a payment.
- **Gold — Hire it.** You give an escrow it must earn.
- **Ember — Mandate it.** You give standing authority, capped and revocable.

---

## 5. Visual identity

Twelve competitor homepages captured at 1440x1000. Eight are the same page:
near-black ground, one warm gold accent, a promise headline, a row of huge
numbers, four category chips. trust8004, Marque, SMEAI, Genesis, Pokter,
onplaced and current BENCH are mutually indistinguishable as thumbnails.

Only two escaped, both by committing to a material: **Kawal** (cream ledger form,
"Most agents on BSC cannot be hired") and **Agripinaa** (boutique catalogue).

**The unclaimed position: nobody is cold.** Every dark entry is neutral-black
plus warm gold. Deep ink-navy with a cold mint signal reads as an instrument —
an oscilloscope, a risk terminal — the exact register of "we measured it".

### Palette

| Role | Hex | Use |
|---|---|---|
| Ink | `#0B1220` | ground |
| Surface | `#111B2B` | cards |
| Signal / Call | `#5FE3C0` | proven, teal rail |
| Escrow / Hire | `#F0B429` | gold rail |
| Mandate | `#FF8A5B` | ember rail |
| Refused | `#6C7C8B` | never red |

Ship a real light mode. Almost the entire field is dark-only.

### Typography

| Role | Face | Why |
|---|---|---|
| Display | Archivo 800, tight | Industrial grotesk. Not Inter, not Space Grotesk — the field's defaults. |
| Reading | Source Serif 4 | A serif body signals a document, not a landing page. Nobody in the field uses one. |
| Data | JetBrains Mono, tabular | Every figure, hash, block, selector. |

### Voice

The README voice — flat, exact, willing to say what failed — moves onto the site
verbatim. Never a slogan that would still be true if the product did not work.
Every figure carries its block. A refusal is a finding, not an error.

---

## 6. Competitive map — what to take

| From | Idea | Why | Verdict |
|---|---|---|---|
| Marque | Published funnel: registered → declares → responds → works → dead → **never probed** | Turns shallow-crawl weakness into an honesty feature | Take |
| trust8004 | Provenance tag per fact: `declared`/`observed`/`onchain`/`derived` | Directly serves Data Quality; Measure type already carries method | Take |
| trust8004 | MCP search with four categories as typed enum | Judges drive it from Cursor | Extend |
| SMEAI | Clone/cluster detection | We already compute origin clustering and don't show it | Ship it |
| docket | Six-rung evidence ladder | Makes listing quality legible | Take |
| agentcensus | URI-kind breakdown + alive/dead/**degraded**/never-probed | "Degraded" is a state we lack | Take |
| chainhelix | Multi-asset x402 with eip3009 **and** permit2-exact | We proved USDT/USDC lack EIP-3009; permit2 sells to USDT holders | Take |
| chainhelix | Quotes signed EIP-191, verified against agent wallet | Closes our `signed: false` gap | Take |
| agripinaa | Execution receipts with surplus in bps | Only rival with verified mainnet execution | Match |
| positioncrew | Production smoke on a schedule | Ours exists but the runner is locked | Fix |
| kawal | Nerve: "Most agents on BSC cannot be hired" | Proof the honest-scarcity headline lands | Nerve only |
| onplaced | Network graph | Low information — unless fed our cluster data | Only with our data |
| Marque | Spend-capped revocable charters | Theirs never exercised; ours revokes on mainnet | **Already ahead** |

---

## 7. The rooms

Homepage headline:

> **310,387 agents are registered on BNB Chain. 1,186 declare a way to reach
> them. We called every one.**

| Route | Job | Change |
|---|---|---|
| `/` | Funnel + four doors | Rebuilt around 310,387. House agents never first by default. |
| `/j/[job]` | One category in depth | Four genuinely equal templates. This is the Agent Diversity score. |
| `/a/[chain]/[id]` | One agent's file | Claim vs chain vs probe, each fact provenance-tagged |
| `/dryrun/[id]` | **New. Hero room.** | Address in → replay against real position → verdict, incl. "hire nobody" |
| `/hire/[chain]/[id]` | The engagement | May/may-not, custody, signature count, server-rendered |
| `/desk` | What is working | Real Reclaim/Revoke + plain-English may/may-not per Altana |
| `/standard` | **New.** Listing test | Published, versioned test. The ratings-agency play. |
| `/advantage` | TermiX report | Needs trading/stock/security task + outputs attached |
| `/data` | Every number's method | Keep. Already better than anything in the field. |

---

## 8. Four categories, genuinely equal

| Question | Rebalancing | Grid | Yield | Health factor |
|---|---|---|---|---|
| What we index | LP range mgmt | Grid orders | APR routing | Liquidation defence |
| Live data | V3 position, band, in-range % | Pool depth, realised vol, fee tier | Venus/Lista/PCS APRs at a block | Venus liquidity, borrow limit, HF |
| Dry run | Replay recentres — **built** | Replay ladder fills — **extend** | Replay rotations vs APR series — **build** | Replay top-ups vs price path — **build** |
| Counterfactual | Every category compares against **doing nothing**, and prints it even when doing nothing wins |
| Activation | All three rails in all four categories, or the row says which is closed and why |

**Yield replay:** walk Venus/Lista rate history, drive rotation, charge real gas,
compare against sitting in the highest-APR pool at t=0. Likely finding: rotation
loses to sitting still after gas — exactly the result that wins Data Quality.

**Health-factor replay:** real Venus borrow position, walk the collateral price
path, simulate top-ups at the declared threshold vs doing nothing. Output: how
close to liquidation each got, and what the defence cost.

---

## 9. Scoring every criterion

### Main track — $30,000 + adoption

| Criterion | Brief's words | Now | To the ceiling |
|---|---|---|---|
| Functionality | "land, find by category, understand, activate, minimal friction" | Strong — 3 rails, 1 settled on mainnet | No wallet gate. Every category needs a row with all three rails open. EIP-5792 batching → one popup. |
| Data Quality | "beyond basic counts… genuinely informed call" | Engine yes, corpus no | 310,387 indexed + funnel + provenance + **dry run on the user's own position** |
| Agent Diversity | "all four, equally deep" | **Failing** | Classify the whole set; per-category counts within a stated ratio; gate in CI |
| Phase 2 | "more criteria in the second phase" | — | Unknown criteria reward depth. Build for round two. |

**Two-stage contest:** top 3 shortlisted publicly, then Phase 2. Stage one is won
on the first screen and the four doors. Stage two on the engine. We are currently
built only for stage two.

### Altana — 50,000 XP, winner takes all

| Asks for | Status | Action |
|---|---|---|
| Agents on their own Altana wallets | Not funded | Fund each reference agent on its own mainnet wallet |
| Sessions with allowlist, cap, expiry | **Proven** | Done: 4 allowed, 8 withheld, 0.001 BNB, 15 min |
| Sessions registered in Keystore | **Does not land** | The one blocking bug — see §10 |
| Real onchain tx through session key | **Proven** | Mainnet, with negative tests |
| User-facing see + revoke | Half | Revoke real; add plain-English may/may-not for a visitor's session |
| Bonus: ERC-8183 SDK, x402 server SDK | Partial | Move escrow to mainnet; stand up a seller endpoint |

### TermiX — $6,000 / $3,000 / $1,000

| Weight | Criterion | Action |
|---|---|---|
| 30% | Value of Services | Call rail is $0.01, settles without buyer gas. Lead with price + settled tx. |
| 30% | Proven Agent Advantage | Report required for eligibility. 3+ tasks both ways, outputs attached, ≥1 trading/stock/security. |
| 20% | High-stakes + track record | They want win rate, window, risk taken. The replay engine produces exactly those three. |
| 20% | Marketplace quality | "Find, compare, hire, without instructions." The frontend rebuild. |

Keep the losing round in the report. "Measured, not asserted" is a 30% criterion,
and a report where hiring loses once is the most credible evidence the rest was
measured.

### PancakeSwap — 1,000 CAKE

Lead with `RecipientBound.sol`, not the agent. It removes the `recipient`
argument from the interface so a session key cannot redirect funds — a literal
answer to "without ever putting user funds at risk."

---

## 10. Architecture

### Keep — the moat
- `packages/counterfactual` — replay engine + no-lookahead proof. **Nobody else has this.**
- `packages/rails` — call/hire/mandate with the mainnet proofs
- `packages/measure` — Measure/Maybe. An unknown is never a zero.
- `contracts/RecipientBound.sol` — 18 tests, 512-run fuzz on the cap invariant
- `tools/checks` and the writing voice

### Burn and rebuild
- The entire frontend and IA — new brand, new rooms, light + dark
- `packages/index` — rewrite around 8004scan cursor pagination
- Job classification — currently leaves 189/200 `null`
- The board data model — must carry `hireable`, a ladder rung, a provenance tag
- The worker — scheduled execution on a runner that is not locked

### The pipeline

| Stage | Source | Output | Cadence |
|---|---|---|---|
| 1 Index | 8004scan cursor walk + chain for truth | 310,387 rows | hourly |
| 2 Resolve | tokenURI → data:/ipfs:/https: | Endpoint + card, or a stated reason | hourly |
| 3 Cluster | Origin host + card similarity | Spam farms collapsed (`evoevo.ai` 141, `example.com` 40) | hourly |
| 4 Classify | Card text → one of four jobs + rationale | **Zero `job: null` on listed rows** | hourly |
| 5 Probe | Call endpoint, parse 402 | alive/degraded/dead/never-probed + latency | 15 min |
| 6 Quote | ERC-8183 negotiate, verify EIP-191 | Price, expiry, signer verified | on view |
| 7 Replay | Pool swaps / rate history / price path | The dry run | on demand + nightly |
| 8 Publish | Snapshot with block + method | The committed board | 15 min |

Keep the committed-board design — it is why the front door does not go blank when
a third party has a bad day.

### The Keystore bug, diagnosed

`findRegistrationTx` in `packages/rails/src/session.ts` filters logs by
`address: account` — the delegated account. The Keystore is a **separate
contract** at `0x6572427ED530BadcF7375Cf9A4709D8d2b0E7E0a`, confirmed live on BSC
mainnet with **8,756 bytes of code**. Registration events belong to it.

Two fixes, in order:
1. Re-run the log query against the Keystore address rather than the account.
2. Drive registration through the SDK's `grantSession` with registration enabled
   and capture the receipt's logs directly rather than searching afterwards.

The contract emitted no logs in the last ~2,000 blocks sampled, so the path may be
cold — the receipt-capture approach is the likelier fix.

---

## 11. The gates

| Gate | Enforces | Status |
|---|---|---|
| `check:ranking` | House agents never outrank a better-measured third party | Have |
| `check:absence` | An unknown is never a zero, blank or dash | Have |
| `check:measurement` | Every figure carries its block and method | Have |
| `check:network` | Chain 56 and 97 never in one figure | Have |
| `check:no-lookahead` | A strategy cannot see past its own block | Have |
| `check:diversity` | The four jobs are equal in depth | **Tighten** — must fail on 5/18/16/8 |
| `check:classified` | No listed row carries `job: null` | **Build** |
| `check:hireable` | Every category has ≥1 row with all three rails open | **Build** |
| `check:provenance` | Every rendered fact carries its provenance | **Build** |
| `check:freshness` | Snapshot younger than a stated age, or the site says its age | **Build** |

**Fix the runner first.** The most recent commit reads *"GitHub Actions is locked
on this account, so nothing scheduled has ever run."* Every gate is decoration
until something executes them on a schedule.

---

## 12. Risks

| Risk | Why real | Insurance |
|---|---|---|
| Supply is genuinely scarce | Only 1,186 of 310,387 declare an endpoint | Make scarcity the headline. The funnel *is* the product. |
| The runner stays locked | Already blocked every scheduled job | Phase 0 task zero. Railway is already configured. |
| Keystore never lands | Contract emitted no logs in the sampled window | Report unproven — but try receipt-capture first |
| Judges never reach the engine | Stage one decided on the first screen | Put a dry run on the homepage with a pre-filled example |
| The replay is one window | Our own README says an earlier window had every strategy losing | Multi-window: run N windows, publish the distribution |
| Over-building past judging | No deadline cuts both ways | Phases 0–2 change the score. Ship in order. |

---

## 13. The pitch

> 310,387 agents are registered on BNB Chain. 1,186 can be reached. We called
> every one of them, we replay the survivors against the position you actually
> hold, and we will tell you when the right answer is to hire nobody.

Every rival can claim a number. Only one can show you what an agent would have
done to your money — and none of them will tell you not to buy.
