# BUILD-PLAN — conformance against `mainplan.md`

**`mainplan.md` is the plan.** This file is the audit: every checkable requirement in it, and
whether the deployed product satisfies it. It is not a summary of the plan and never restates it.

One rule governs every status word: **code that runs is not a proof.** *Built* is what exists in
the repository; *proven* is an artifact on chain 56 anyone can re-derive, recorded by a `prove-*`
script in `apps/web/data/proofs.json`.

Live: **https://bench-six-sigma.vercel.app**

---

## Part IV §20 — build order

| Phase | Built | Proven | State |
|---|---|---|---|
| **P0** The spine | Route tree, `Measurement`/`Maybe`, board, four doors, ERC-8004 sweep, prober with the three-input check, B402 ingest | Funnel serves a block-stamped snapshot; 50 rows render with JavaScript off | **done** |
| **P1** Rail 1 — Call | `rails/call.ts`; 11 third-party endpoints callable | `rail-1-third-party` — 0.01 USD1 to an endpoint we do not operate, tx `0x2e39…83ca`, 6/6 | **done** |
| **P2** Rail 3 — Mandate | `mandate.ts`, `session.ts`, `ProvenScope`, `RecipientBound.sol` | `rail-3-scope-holds` — **9 proven, 0 failed, 1 inconclusive** on mainnet | **done** |
| **P3** Rail 2 — Hire | `hire.ts`, full ERC-8183 lifecycle, `prove-hire.ts` | `rail-2-escrow-funded` — **7/0/1** on testnet, job 1139 FUNDED | **testnet done, mainnet owed** |
| **P4** Counterfactual | Engine, worker run on `/data`, per-position replay on `/a/…?position=` | 18,911 swaps published; a real position replayed live | **engine done, board column owed** |
| **P5** Depth | Four job routes, `/data`, `/register`, `/list`, `/api/v1`, `/api/mcp`, agent card | 9 findings recorded, all block-stamped | **partial** |
| **P6** `OutcomePolicy` | `OutcomePolicy.sol` + 15 tests, incl. a 512-run fuzz | Cannot be bound: the router whitelists policies (`PolicyNotWhitelisted`), measured on a fresh job | **written; blocked upstream** |
| **P7** Supply and usage | — no Studio on-ramp, no seller dashboard | — | **not started** |
| **P8** Polish | Motion layer, footer, mobile to 360px, 8 gates | Smoke green against production | **ongoing** |

---

## §11 Information architecture — routes

| Required | State |
|---|---|
| `/` `/j/[job]` `/a/[chain]/[id]` `/hire/[chain]/[id]` `/desk` `/register` `/data` `/list` | all present |
| `/api/v1/*`, `/api/mcp`, `/.well-known/agent-card.json` | present |
| `/api/a2a` | **done** — one engine, two vocabularies |

## §8 Agents hiring agents — MCP tools

| Tool | State |
|---|---|
| `find_agents`, `read_agent`, `plan_hire`, `list_agent` | present |
| `counterfactual`, `request_quote` | **done** — seven tools |

## §12 Screen specifications

| Requirement | State |
|---|---|
| 12.1 no marketing hero; inventory is the homepage | done |
| 12.1 four job doors, equal width, live hireable count, block-stamped | done |
| 12.1 unhireable rows listed with the specific reason | done |
| 12.1 honesty line at the bottom, muted, linking `/data` | done |
| 12.1 `FOR YOU` column — the counterfactual, per row | **done** — one walk serves every row |
| 12.2 counterfactual first, above the record and the rails | done |
| 12.2 `▸ Every check we ran against the chain` — the §15 ladder | **done** — nine rungs, each with its proof |
| **12.2 `▸ Reputation` — raw vs sybil-filtered, flagged cohort** | **to verify** |
| 12.3 may / may-not, custody, signatures declared before the button | present |
| 12.4 `/desk` projected vs actual side by side | **done** — forecast error published on `/desk` and `/data` |

## §13 Design system

| Requirement | State |
|---|---|
| 13.2 all ten colour tokens, exact hex | **all present** |
| 13.2 rail ramp is the entire chromatic system | done |
| 13.2 refusals in `--dim`, never red; unmeasured as words, never `0` | enforced by `check:absence` |
| 13.3 Geist Sans + Geist Mono, `tabular-nums` | done |
| 13.3 scale 12/14/16/20/25/31/39 | **exact match** |
| 13.4 one motion moment; nothing animates without a data event | enforced by `check:motion` |
| 13.5 JS < 90KB, works with JavaScript off, mobile to 360px | enforced by `check:budget`, `smoke` |

## §15 Trust architecture

**Rendered on every agent page**, as nine rows rather than a score: each rung a yes or a no, with
what proved it printed beside it.

Two rungs cannot light for anyone and stay on the ladder unlit, with the reason. Rung 7 needs
B402's `l30DaysUniquePayers`, which Binance documents and the public API does not serve; rung 8
needs a job settled through this marketplace, and none has. Deleting them would make the ladder
look complete and the product look further along than it is — an unlit rung with a sentence
attached is the honest shape and doubles as the roadmap.

An unlit rung uses `--dim`, never red: most are not failures. An agent that does not implement the
ERC-8183 seller side has done nothing wrong, it simply cannot be hired that way.

## §6 / P6 — `OutcomePolicy`

**Written, tested, and not bindable — for a reason that changes what §6 is.**

`contracts/src/OutcomePolicy.sol`, 15 tests including a 512-run fuzz on the verdict invariant.
Assertions are bound once and never edited; the verdict is `view`; an oracle is called with a
bounded stipend and its revert is caught.

The line that matters is the one that does nothing: an oracle that reverts, has no code, returns
something undecodable, tries to burn the caller's gas, or simply answers "I could not see" yields
**`Unmeasurable`**, and the job falls back to the optimistic path instead of settling either way.
A policy that guesses when it cannot see converts an honest *we do not know* into a transfer of
somebody's money, silently. Four of the fifteen tests exist only to prove it refuses.

### The finding that relocates the whole discontinuity

§6.1 rests on one sentence — *"The policy is a pluggable contract bound per job via `registerJob`.
That pluggability is the opening."*

**It is not open.** The router keeps an allowlist and rejects everything else with
`PolicyNotWhitelisted()` (`0xc94463e3`), a custom error recovered by brute-forcing candidate
signatures against keccak.

Measured on a fresh job (1148) so state could not be a confound, varying only the policy address:

| policy | result |
|---|---|
| the live `0xd6a42175…1cEA` | **OK** |
| the SDK's `0x4F4678D4…78A6` — a deployed policy of identical size that answers `disputeWindow()` | reverted |
| an unrelated deployed contract | reverted |

So settlement policy on ERC-8183 is pluggable **by Altana**, not by a marketplace. This does not
kill the idea; it relocates it. §6.4's fourth step — *propose it upstream as a reference
implementation* — stops being the last step and becomes **the only route to the second**. The
contract is written to be read and argued with by the people who control that list.

One thing it does not claim: the router-facing hook set is **unverified**. The published interface
is `disputeWindow()` and `dispute(uint256)`; the live policy's dispatcher carries forty-nine
further selectors whose names are not published, and the allowlist makes them impossible to
exercise. The contract implements the documented surface and says so rather than claiming to be
drop-in.

## §16 Seller economics

No seller dashboard. Ranking is published on `/data` and enforced by `check:ranking`.

---

## §21 The proof artifacts

| # | Artifact | State |
|---|---|---|
| 1 | A stranger pays $0.01 to an agent we do not operate | **done**, mainnet |
| 2 | A mainnet Altana session, Keystore-registered, visible in the explorer | **owed** — sessions grant and revoke, `registered: false` every time |
| 3 | `prove-scope`: grant → in-scope → out-of-scope refused → revoke → dead | **done**, 9/10 |
| 4 | `RecipientBound` deployed **and source-verified** | deployed and bytecode-matched; **verification owed** |
| 5 | An ERC-8183 job hired from the product, deliverable keccak-verified, loop closed on testnet | **partial** — funded, no deliverable |
| 6 | A mainnet ERC-8183 job funded with its chain-read settlement date displayed | **owed** |
| 7 | A counterfactual on a real user position with a reproduce command | **done** |
| 8 | Four categories, each with a first-party agent and a chain-read metric | **partial** |
| 9 | The funnel and the 96.84% origin concentration, block-pinned, with method | **done** |
| 10 | An agent hires from BENCH over MCP with no browser | **discovery → read → plan works over A2A and MCP**; a settled hire still owed |

---

## Two measured facts that contradict the plan

**§7.2 and §15 rung 7 — B402 usage fields.** The plan says the Bazaar publishes `fail_rate_24h`,
`l30DaysTotalCalls` and `l30DaysUniquePayers`. Binance documents them; **the public discovery API
does not serve them.** Every item carries exactly `resource`, `type`, `x402Version`, `description`,
`accepts`, `lastUpdated`. Rung 7 cannot light as written.

**§17 — four agents.** The repository has eight, two per category. The second of each pair is what
makes a per-job comparison non-trivial. Recommend amending the plan rather than deleting four.

---

## Order of work

1. **§12.1 `FOR YOU` column.** One replay serves every row: the reference strategies are shared, so
   a board with an address needs a single walk, not one per row.
2. **§15 ladder on the agent page**, and §12.2's remaining disclosures.
3. **`/api/a2a`** and the two missing MCP tools — §21 artifact 10 depends on them.
4. **§12.4 projected vs actual** on `/desk`.
5. **P6 `OutcomePolicy`.**
6. The outstanding proof artifacts.


## §12.1 — the `FOR YOU` column

`/?position=0x…` reads the address's positions, replays the reference strategies
against the largest, and puts each agent's figure on its own row.

**One walk, not fifty.** The naive reading of "a figure on every row" is a replay
per agent. It is not needed: the strategies are shared, so one walk of the
reader's own pool produces every row at once, and the column costs exactly what
the agent page's single panel costs.

**The default board does not stream.** Next streams a Suspense boundary by
sending the fallback and swapping it with an inline script, which never happens
with JavaScript off — so wrapping the board unconditionally would have broken
§13.5's floor and the smoke check that holds it. Only the opt-in path streams.
`smoke` still reports 50 rows rendering with scripting disabled.

### Three bugs found by building it

**Our own eight agents had been invisible on our own board since the rename.**
`houseOrigin()` still defaulted to `bench-bnb.vercel.app`, so the prober called
an origin that no longer existed and marked every house agent `endpoint-404` —
below every third-party listing on our own front page. Callable went **11 → 19**.

**`applyHouse` had never once done anything.** It looks a house agent up by
`houseByTokenId`, which compared only against a *registered* ERC-8004 id. None
of ours is registered — reserving an id we do not hold is the claim this product
refuses — so `houseRows` writes the synthetic `house:<slug>` instead and the
lookup matched nothing. Nothing failed, because `houseRows` had already written
the name and description once at creation, so the no-op was invisible until the
endpoint needed to change and did not.

**An endpoint that moves invalidates the probe that judged it.** `endpoint-404`
for a URL we have stopped using is a statement about our own history, not about
the agent. Changing it now clears the probe and lets the freshness rule close
the rails, which §12.1 already required.

### A zero that is an answer, not a blank

Over the first window tried, the position was 98.9% in range and the patient
keepers correctly did nothing — `vsHold = 0` exactly. Rendered as `0.000` in the
grey used for refusals it read as a missing number, which is the opposite of
what it is. It renders as **"no change"** with the reason attached, and the
summary line says how many never acted and why.


## §8 and §11 — the machine surfaces

`/api/a2a` is a thin translation over the MCP engine, not a second
implementation. A2A and MCP are both JSON-RPC over POST; the difference is
vocabulary (`message/send` with parts against `tools/call` with arguments), not
capability. Two implementations would disagree the first time one changed, and
the disagreement would be invisible until somebody hired the wrong thing through
the stale one. `skills/list` is derived from `tools/list`, so the two cannot
drift.

Seven tools now: `find_agents`, `read_agent`, `read_funnel`, `plan_hire`,
**`counterfactual`**, **`request_quote`**, `list_agent`.

### Walking the journey found the gap the journey exists to prevent

§8 claims an agent can discover, evaluate and hire without a browser. Trying it
end to end, the chain broke twice between the first step and the third:

1. **`find_agents` returned no usable id.** Rows carried a token id and a URL;
   every action tool takes a board id. A machine could find an agent and then
   had nothing to act on it with.
2. **`findRow` would not accept its own output.** Given the row key it emits —
   `a:56:<id>` — it answered that the deployment had never heard of it.

Neither is visible from a page, because a page carries the id inside an href it
built itself. Only a caller round-tripping our own output could see it, and
until this route existed there was no such caller.

**The rule that settles it: anything this product emits as an identifier must be
accepted back as one.** A surface that will not take its own output is not an
API.

### `paid: null` was ambiguous, and money is the wrong thing to be ambiguous about

The call rail returned `paid` and `txHash` with no account of what a null meant.
To a person it reads as "free"; the truth was usually "we owe them a cent".
x402 separates authorising a transfer from submitting it — the buyer signs, the
seller verifies and answers, a facilitator submits — so a deployment with no
settler key has done everything except the last step.

The response now carries `settlement: { state, why }` with three distinct
states: **settled**, **outstanding** (signed, verified, served, not submitted —
the seller is owed and can still submit the authorisation itself), and
**unpaid** (the endpoint asked for nothing). §14.1 requires an absence to carry
a reason, and two nulls are not a reason.


## §9 and §12.4 — the product grades itself

`npm run grade` replays the published strategies over the window that came
**after** the published one, and publishes the difference.

**Why it is a real forecast test.** Replaying a window and then "measuring" the
same window proves nothing — the replay already saw every trade in it. The two
windows are disjoint: the published one is blocks A→B, the graded one B→head,
and nothing about the second was visible when the first was written. To make
that testable today rather than in three hours, `counterfactual --ago N` ends
the published window N blocks before the head, leaving a real successor to grade
against immediately.

It **refuses** rather than guesses when fewer than 20,000 blocks have passed: a
window graded against a much shorter one measures the clock, not the strategy.

### The first grade, and it found something

Two disjoint 24-hour windows on WBNB/USDT, 22,651 swaps then 19,350, both
complete:

| | we said | it did | wrong by | direction |
|---|---|---|---|---|
| Range Keeper I | −11.48 | −5.29 | **+6.19** | held |
| Range Keeper II | −21.54 | −11.30 | **+10.24** | held |
| Tight Band Keeper | −29.25 | −11.53 | **+17.72** | held |

**3 of 3 kept their sign** — every strategy projected to lose did lose, so the
ranking held out of sample. But **every error points the same way**, which makes
it bias rather than noise: the replay **overstates losses**, by 11.38 on
average, and the overstatement grows with how often a strategy acts.

That is the cost model doing exactly what it was built to do. `cost.ts` bounds
slippage pessimistically on purpose — *"a cost reported too low is a marketplace
that told somebody to hire the wrong agent"* — and this is the first measurement
of how pessimistic. It is now a published number a reader can correct for rather
than an assertion in a comment.

### What per-engagement grading still needs

`Engagement` now carries `projection` and `outcome`. None of the six existing
engagements has either, and **nothing backfills them**: a projection written
afterwards, by code that can already see how the window turned out, is a
postdiction wearing a forecast's clothes. The desk says exactly that rather than
showing a number it cannot stand behind.


## The production gap the screenshots found

I had not looked at the deployed site in a long session of building it. Doing so
showed a board of eleven rows reading `not measured`, `no price`, `Why not`,
with every rail dot dark — while the ticker above it said **19 callable**.

Nothing was broken. §12.1 requires that *a rail not re-checked inside the
freshness window closes rather than staying green*, the window is 45 minutes,
and the last probe was 70 minutes old. The board was telling the truth.

**The truth was the problem.** The site reads a board committed at deploy time,
so within an hour of every deploy the marketplace correctly reports that it can
do nothing. `railway.json` already runs the worker always-on — but the worker
writes to its own disk, and the site reads a file baked into a Vercel build.
**The two never meet.**

### Completing the path that was already intended

- The worker **serves** its board when `PORT` is set — `/board-<chain>.json` and
  `/health`, which is what Railway provides and what its healthcheck wants.
- The site reads `BOARD_URL` in the background and swaps its cache. `getBoard`
  stays synchronous, so no page waits on a third party to render: the first
  request after a cold start serves the committed copy, which is a real board
  and simply older, and every request after that serves the live one.
- With `BOARD_URL` unset or the worker unreachable, the committed copy answers
  and nothing degrades. That fallback is the point, and the README already
  claimed it: *the front door of a marketplace must not go blank when a third
  party's database is unhappy.*

### Two things the screenshot showed that are worth fixing next

- **The four job doors all read `2 callable`** where §12.1 specifies a count of
  what is *hireable*. Four identical numbers read as broken even when true.
- **Refusal chips render in ember.** §13.2 reserves that for the mandate rail
  and says refusals render in `--dim`, *"absence of light, never in red"*. On a
  board where most rows carry a refusal, the loudest colour on the page is
  currently attached to the least important information.
