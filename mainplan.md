# BENCH — The Definitive Plan

**The hiring layer for the agent economy.**

Written as a company plan, not a hackathon entry. The hackathon is the first customer, not the
goal. If this is built as specified, BNB Chain does not choose BENCH over other submissions —
they conclude there is nothing else in the category.

Grounded in: the hackathon page read in full; BNB Chain's launch blog and AI Agent Landscape
report; Agent Studio docs and product page; the Altana SDK, Keystore and Skills Registry; Binance
B402 Bazaar docs; source-level audits of 65 competitor repositories at HEAD; and a module-by-module
audit of MANDATE.

---

## Contents

**Part I — The thesis**
1. [What is actually being sold](#1-what-is-actually-being-sold)
2. [The business](#2-the-business)
3. [Why the whole field is stuck](#3-why-the-whole-field-is-stuck)

**Part II — The product**
4. [The five discontinuities](#4-the-five-discontinuities)
5. [Discontinuity I — counterfactual hiring](#5-discontinuity-i--counterfactual-hiring)
6. [Discontinuity II — outcome-conditioned escrow](#6-discontinuity-ii--outcome-conditioned-escrow)
7. [Discontinuity III — manufacturing supply](#7-discontinuity-iii--manufacturing-supply)
8. [Discontinuity IV — agents hiring agents](#8-discontinuity-iv--agents-hiring-agents)
9. [Discontinuity V — the outcome ledger](#9-discontinuity-v--the-outcome-ledger)
10. [The three rails](#10-the-three-rails)
11. [Information architecture](#11-information-architecture)
12. [Screen specifications](#12-screen-specifications)
13. [Design system](#13-design-system)

**Part III — The machine**
14. [Data model](#14-data-model)
15. [Trust architecture](#15-trust-architecture)
16. [Seller economics](#16-seller-economics)
17. [Our own agents](#17-our-own-agents)
18. [Technical architecture](#18-technical-architecture)
19. [What ports from MANDATE](#19-what-ports-from-mandate)

**Part IV — Execution**
20. [Build order](#20-build-order)
21. [The proof artifacts](#21-the-proof-artifacts)
22. [Partner tracks](#22-partner-tracks)
23. [Day one of adoption](#23-day-one-of-adoption)
24. [Anti-drift rules](#24-anti-drift-rules)
25. [Risk register](#25-risk-register)
26. [Appendices](#appendix-a--addresses-and-chain-facts)

---

# Part I — The thesis

## 1. What is actually being sold

The main prize is not $30,000. It is:

> "Official adoption as the BNB Agent Studio marketplace, the canonical front door for every agent
> on BSC" — "backed as a standalone product with its own brand and team, incubated as the
> discoverability layer for agents on BSC."

That is an acquisition and a hiring decision. The question a judge is really answering is not
*"which submission scores highest?"* It is *"which of these could we put our name on, staff, and
still be proud of in eighteen months?"*

Nothing in this document is optimised for a rubric score. Everything is optimised for that
question. The rubric follows automatically — a product that genuinely makes hiring easy will score
maximum on Functionality; a product whose numbers come from chain will score maximum on Data
Quality; a product with four equally instrumented categories will score maximum on Agent Diversity.

### The gap in BNB Chain's own stack

BNB Agent Studio is a **factory with no shop**. Its documentation states it plainly:

> "v0.0.1 is seller-only. The CLI (`bag`), runtime library, read-only MCP server, and IDE skills
> ship today. **Buyer product flows and a hosted console are deferred to v2.**"

Its product page is entirely supply-side — *"Prompt in. Agent out."*, *"Your agent charges for its
work. You collect."* Its roadmap is a developer dashboard, key security, more supply.

And their own landscape report names the consequence:

> "The identity base is large but **application-level demand, the volume of real work agents pay
> for, still has to be proven.** Naming the gaps is part of reading the data honestly."

**BENCH is the demand side of BNB Chain's own product.** That is the entire strategic position.
Everything else is implementation.

---

## 2. The business

### 2.1 The market, with numbers

| Fact | Source |
|---|---|
| Agentic commerce: $7.7B (2026) → $65.5B (2033), 35.7% CAGR | Grand View Research |
| McKinsey's ceiling case: $3–5T in agentic consumer sales by 2030 | McKinsey |
| x402 processes ~$600M annually across all chains today | BlockEden |
| 100M+ cumulative x402 transactions on Base through Q1 2026 | Chainalysis |
| **87% of financial institutions cite trust as the single biggest obstacle to agentic payments** | industry survey |
| Only 29% of UK consumers trust AI for automated payments | industry survey |

### 2.2 The asymmetry that defines the opportunity

BNB Chain has **~60% of all ERC-8004 agent identities across 26 networks** — more than every other
chain combined. Solana has **49% of x402 payment volume**.

**BNB Chain owns the identity layer and does not own the commerce layer.** Agents register there
and transact elsewhere. That is the strategic wound BENCH closes, and it is why adoption is on the
table rather than a prize cheque.

### 2.3 Why trust is the product, not a feature

The single most-cited blocker in every agentic-payments survey is trust. Not latency, not cost,
not standards. And the three-rail model in §10 is precisely a trust instrument: it lets a buyer
choose *how much they are risking* rather than asking them to believe a claim.

That is not a marketplace feature. It is the reason the marketplace can exist at all.

### 2.4 Revenue

| Line | Mechanism | Timing |
|---|---|---|
| Escrow take rate | 2–5% of ERC-8183 job value, charged at settlement against escrowed capital | Rail 2 live |
| Performance fee share | 10–20% of the agent's performance fee on mandates | Rail 3 live |
| Facilitator margin | Basis points on x402/B402 settlement routed through BENCH | Rail 1 at volume |
| Seller tier | Verification, analytics, priority placement — never ranking | Year 1 |
| Outcome API | Institutional access to the performance dataset | Year 2 |

At $100M/yr of routed agent labour and a 3% blended take, that is $3M revenue. The billion-dollar
case is not the take rate — it is being the layer everything routes through, then expanding along
ERC-8004 to the other 25 chains where the standard already exists.

### 2.5 The moat

Not the code. Three things, in ascending order of durability:

1. **Adoption as the official front door** — distribution nobody else can buy.
2. **The settlement policy contract** (§6) — if outcome-conditioned settlement becomes how agent
   jobs close on BSC, BENCH wrote the market's plumbing.
3. **The outcome ledger** (§9) — every hire that settles through BENCH produces a measured
   outcome. That dataset compounds, cannot be scraped, and is the only real answer to "which agent
   should I hire?" A competitor can copy the interface in a week and cannot copy four months of
   settled outcomes.

---

## 3. Why the whole field is stuck

I read all 65 repositories at source. They fail in four distinguishable ways, and every failure is
a variation on one root cause.

**The root cause: everyone is building a better catalogue of a dead inventory.**

Of 334,770 registered agents on BSC, ~30,015 declare an endpoint, and **29,067 of those — 96.84% —
resolve to a single host** (`platform-backend.prod.termix.live`). The next largest is 240. Roughly
125,000 have metadata that is HTTP-unreachable outright. The honest count of distinct, reachable,
hireable services is in the low hundreds.

Against that reality:

| Failure mode | Who | What it looks like |
|---|---|---|
| **Boutique disguised as a marketplace** | Agripinaa | Eight excellent first-party agents; `agentSupportsSessionHandoff()` returns hardcoded `false`, so no third-party agent can ever be hired |
| **Directory with a payment rail** | gilbertsahumada | Complete 334k sweep, a settled mainnet ERC-8183 job — and **zero** files computing time-in-range, realized PnL or net APY. It cannot tell you whether an agent is any good |
| **Measurement without action** | Docket | The best methodology in the field; by its own README, no service holds a session key, a signer, or a transaction submitter |
| **Mechanism without a journey** | MANDATE (ours) | 5,446 lines of settlement Solidity, bonds, slashing, an assay office scoring agents in millesimal fineness — and a homepage that critiques the registry instead of selling a job |

**Nobody is answering the buyer's actual question.** The buyer does not want to browse agents. The
buyer has a position that is bleeding money and wants to know which agent would stop it, and by how
much.

That question has never been answered by anything in this field. Answering it is §5.

---

# Part II — The product

## 4. The five discontinuities

These are not features. Each is a category difference — a thing the rest of the field cannot reach
by polishing what it has.

| | Discontinuity | Why it cannot be caught up to |
|---|---|---|
| **I** | **Counterfactual hiring** — "what would this agent have done to *your* position, in dollars, over the last 30 days?" | Requires strategies written as pure functions of chain state, tick-history reconstruction, and V3 position math. Nobody else has the architecture. |
| **II** | **Outcome-conditioned escrow** — the job settles on a measured outcome read from chain, not on "something was submitted" | Requires a settlement policy contract plus per-category measurement. It is a contribution to ERC-8183, not a UI. |
| **III** | **Manufacturing supply** — a path from strategy code to listed, earning agent, wired to Agent Studio's own CLI | Everyone else treats supply as given. It is the actual bottleneck. |
| **IV** | **Agents hiring agents** — full discovery, evaluation and hire over MCP, A2A and x402 with no browser | This is where volume comes from, and it is TermiX's own stated thesis |
| **V** | **The outcome ledger** — the only dataset of what agents actually did with real money on BSC, published openly | Compounds with time. Cannot be scraped or forked. |

---

## 5. Discontinuity I — counterfactual hiring

**The single most important thing in this document.**

### 5.1 The idea

A person connects a wallet. BENCH reads their actual positions on chain. Then, for every candidate
agent in the relevant category, it **replays that agent's strategy against the real price history
of that specific position** and reports the difference in dollars.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Your position                        PancakeSwap V3 · BNB/USDT · #7271073   │
│  $4,214 · out of range 61% of the last 30 days                               │
│  You earned $38 in fees. Held un-pooled, you'd have $4,196.                   │
│                                                                              │
│  What each agent would have done to THIS position, same 30 days:             │
│                                                                              │
│   Range Keeper I      +$218   4 recentres · $11 gas · 94% in range      Hire │
│   BNB LP Rebalancer   +$149   9 recentres · $27 gas · 88% in range      Hire │
│   Tight Band Keeper    −$34  22 recentres · $61 gas · 97% in range      Hire │
│                                                                              │
│   Replayed against pool 0x36696…9e2a, blocks 118,204,113 → 120,417,873       │
│   Method · assumptions · reproduce ↓                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

That third row matters as much as the first. An agent that recentres 22 times looks impressive and
loses money to gas. Showing it is what makes the other two believable.

### 5.2 Why this is a category difference

Every other project in this hackathon shows an agent's **self-reported or aggregate** history. This
shows **your** counterfactual. It converts an abstract directory into a specific dollar figure
attached to money the person already owns.

It also answers TermiX's 30% criterion — *"does hiring an agent actually beat doing the job
yourself, and can you prove it with numbers?"* — not with a report, but as the core product loop.

### 5.3 Why it is feasible, specifically

Three things must be true. All three already are.

**(a) Strategies are pure functions of chain state.** MANDATE's `src/agents/types.ts` defines:

```ts
evaluate(ctx: AgentContext): Promise<Decision>
// AgentContext = { wallet, capWei, price, valuation, state, now }
// Decision     = { actions[], observed, state }
```

Its own comment says it: *"Pure with respect to the chain: reads state, proposes calls, sends
nothing."* `state` carries between runs, so it is already a simulation loop. Feed it historical
`price` and `valuation` and it replays. This architecture is unique in the field.

**(b) Tick history is reconstructable without an archive node.** PancakeSwap V3 pools emit `Swap`
events carrying `sqrtPriceX96` and `tick`. Walking `eth_getLogs` on the pool reconstructs the full
price series. No archive RPC required — only log range access.

**(c) The position math exists.** `src/lib/chain/valuation/tickmath.ts` and `v3.ts` already compute
position amounts from ticks and liquidity, and `logs.ts` is a hardened parallel log walker that
already measures provider limits (5,000-block cap, six ranges in flight) and **counts refused
ranges rather than presenting a hole as an empty record.**

### 5.4 The engine

```
packages/counterfactual/
  history.ts     Swap-event walk → { block, tick, sqrtPriceX96, timestamp }[]
  replay.ts      drive Strategy.evaluate() over the series, carrying state
  simulate.ts    apply each Decision to a simulated position
  cost.ts        gas at observed prices, swap fees, slippage bound
  compare.ts     agent result vs the three benchmarks
  attest.ts      hash inputs + output → reproducible record
```

**Benchmarks, per category** — an agent must beat the *right* alternative, not a straw man:

| Category | Benchmark | Rationale |
|---|---|---|
| Rebalancing | Hold un-pooled | The honest do-nothing |
| Grid | Buy and hold the pair | Otherwise a grid "wins" in any uptrend |
| Yield | **Best passive rate available at each block** | An agent earning 3% while 5% sat idle scores negative |
| Health | Liquidation penalty Venus publishes and charges | The actual cost of not acting |

The yield benchmark is the one everyone gets wrong, and it is already implemented in MANDATE's
market logic as `BestPassiveRate`. It moves here, where it belongs.

### 5.5 The rules that keep it honest

A number that flatters is worse than no number. Six constraints:

1. **Gas is charged at prices observed in the same block**, never estimated.
2. **Slippage is bounded by the pool's actual depth**, not assumed zero.
3. **No lookahead.** `evaluate()` sees only state at or before its decision block. Enforced by
   a test that feeds a future tick and asserts the result is unchanged.
4. **Partial history is declared.** If the log walk refused a range, the result says so and the
   window shrinks rather than silently interpolating.
5. **Losses are shown.** Any agent that would have lost money shows the loss, at the same weight.
   Publish our own agents' losing windows too.
6. **Reproducible.** Every counterfactual publishes pool address, block range, strategy commit
   hash, and a command that reruns it.

### 5.6 Where it appears

- **`/` — the board:** connect wallet → a "for your position" column appears on every row.
- **`/a/[id]` — the agent page:** the headline number, above everything else.
- **`/hire` — the engagement:** "expected +$218 on your position based on the last 30 days" beside
  the price, with the horizon stated.
- **`/desk` — after hiring:** actual vs counterfactual, tracked live. The product grades itself.

That last one is the thing a serious acquirer notices. A marketplace that publishes how wrong its
own projections were is a marketplace that can be trusted with someone's money.

---

## 6. Discontinuity II — outcome-conditioned escrow

### 6.1 The problem with ERC-8183 as it stands

Altana's ERC-8183 escrow releases when a deliverable is submitted and an optimistic dispute window
elapses. The verdict is "did the seller submit something", not "did the thing work". For an agent
selling *financial outcomes*, that is the wrong question.

Confirmed from chain: the mainnet OptimisticPolicy dispute window is **604,800 seconds (7 days)**;
testnet is **900 seconds**. The policy is a pluggable contract bound per job via `registerJob`.

**That pluggability is the opening.**

### 6.2 `OutcomePolicy`

A settlement policy that computes its verdict from chain measurement rather than from silence.

```solidity
/// Settles an ERC-8183 job on a measured outcome rather than on submission.
/// The buyer and seller agree the assertion at hire time; the chain decides.
contract OutcomePolicy {
    struct Assertion {
        Metric  metric;        // TimeInRange | HealthFloor | NetApyVsBest | RealizedPnl
        address subject;       // the position or account measured
        int256  threshold;     // what the agent claimed it would achieve
        uint64  windowStart;
        uint64  windowEnd;
        address oracle;        // the measurement contract
    }
    function check(uint256 jobId) external view returns (uint8 verdict, bytes memory proof);
    function disputeWindow() external view returns (uint64);
}
```

A rebalancing job funded with the assertion *"time in range ≥ 90% over 7 days"* settles to the
agent if the measurement says yes, and refunds the buyer if it says no. Neither party clicks
anything.

### 6.3 Why this is strategically large

- It is a **contribution to the standard**, not to our UI. If BSC agent jobs start settling on
  outcomes, BENCH wrote that plumbing.
- It converts the trust problem — the 87%-cited blocker — from a social problem into a measurement
  problem.
- It gives sellers a reason to prefer BENCH: an honest agent gets paid faster and without argument.
- **It is where MANDATE's best abandoned work belongs.** The three benchmarks in `MandateMarketV2`
  (`Hold`, `BestPassiveRate`, `LiquidationAvoided`), the two-observation alpha derivation, the
  ±2bps rounding tolerance — that logic was sound and the container was wrong. It was built as a
  capital market. It should have been a settlement oracle.

### 6.4 Staging

1. **Optimistic default.** Ship on Altana's standard policy. Everything works.
2. **`OutcomePolicy` as opt-in.** Offered at hire time for the categories where measurement is
   unambiguous — health factor first (a floor is a floor), then rebalancing.
3. **Default for first-party agents.** We take the strictest terms we offer.
4. **Propose it upstream** to Altana and BNB Chain as a reference implementation.

---

## 7. Discontinuity III — manufacturing supply

### 7.1 The bottleneck nobody addressed

Every project treats supply as given, then complains it is dead. The reachable, hireable inventory
on BSC is in the low hundreds. **A marketplace whose real problem is empty shelves must go into
manufacturing.**

### 7.2 Three supply engines

**(a) Ingest everything reachable.** Complete ERC-8004 sweep; B402 Bazaar (free, opt-in, indexed
~30s after first settle, and it already publishes `fail_rate_24h`, `l30DaysTotalCalls` and
`l30DaysUniquePayers` — the best trust signal available on BNB Chain today, and **not one project
in this hackathon used it**); 8004scan for enrichment.

**(b) One-click listing for anyone with a strategy.** `/list` takes a token id, probes it live,
shows exactly what was found and which rails it qualifies for, and — where a check fails — states
the fix. The listing spec is published. An MCP tool lets an agent list itself.

**(c) The Agent Studio on-ramp — the strategic one.** BNB Chain's `bag` CLI takes a developer from
prompt to deployed, registered agent. It has no demand side. So:

```bash
bag deploy my-agent          # Agent Studio: identity, wallet, x402, registration
bench list --from-studio     # BENCH: probe, classify, benchmark, list, price, earn
```

A developer goes from idea to earning revenue without leaving the BNB stack. **BENCH becomes the
distribution layer for Agent Studio.** That is not a marketplace competing for attention — that is
the missing half of their product, and it is the single strongest argument for adoption.

### 7.3 Seeding, honestly

Four first-party agents, one per category (§17), published as **reference implementations against
the open listing spec**. Ranking never privileges them — enforced in the ranking function,
unit-tested, and stated publicly. Anything we did to make ours listable, any operator can do.

And a deliberate act of supply diplomacy: get other teams' agents onto the board. Another
operator's agent, hireable on BENCH, proves the marketplace claim in a way no code can.

---

## 8. Discontinuity IV — agents hiring agents

TermiX's own front page reads *"the marketplace where AI agents hire agents."* That is the correct
long-run thesis and almost nobody built for it.

**BENCH is fully operable without a browser.** Three surfaces, one engine:

| Surface | For | Capability |
|---|---|---|
| **MCP** | Claude Code, Cursor, any MCP client | `find_agents`, `read_agent`, `counterfactual`, `request_quote`, `plan_hire`, `list_agent` |
| **A2A** | Other agents | Agent-card discovery, structured task exchange |
| **x402 / B402** | Machine buyers | Every read endpoint payable; the marketplace itself is a paid service |

Actions that move value return an unsigned transaction with `executed: false` **in the payload**,
not merely in the description. The caller signs. BENCH never holds a key.

BENCH also publishes its own `/.well-known/agent-card.json` and registers under ERC-8004. **The
marketplace is listed on its own board**, hireable over x402 like anything else. That is not a
gimmick — it is the cleanest possible proof that the listing spec is real.

---

## 9. Discontinuity V — the outcome ledger

Every hire that settles through BENCH produces a record:

```
what was promised · what the counterfactual projected · what actually happened
· measured from chain · at a block · with a method
```

Three consequences:

1. **The projection is graded.** Publishing our own forecast error is the strongest possible trust
   signal, and no competitor will volunteer it.
2. **It compounds.** After four months this is the only real dataset of what agents did with real
   money on BSC. It cannot be scraped — it only exists because the hires settled here.
3. **It is published openly.** Free API, no key. A measurement nobody else can obtain is
   indistinguishable from one nobody else can falsify; publishing makes it infrastructure.

This is the moat. Everything above is how we start accumulating it.

---

## 10. The three rails

Every serious team hit the same wall: **you cannot safely hand a session key to a stranger's
agent.** A session key binds a target and four selector bytes; it cannot bind an argument. Granting
`mint(...)` on the position manager grants it with *any* recipient.

Agripinaa hit this and hardcoded handoff to `false`. Docket shipped no signer. MANDATE solved it
with `RecipientBound` and then never hired a third party.

The wall only exists if you assume there is one way to hire.

| | **Call** | **Hire** | **Mandate** |
|---|---|---|---|
| You give | A payment | An escrow it must earn | Scoped standing authority |
| It holds | Nothing | Nothing — funds sit in a contract | A capped, expiring session key |
| Standard | x402 / B402 | ERC-8183 | Altana session + `RecipientBound` |
| Reaches | Any live paid endpoint | Any ERC-8183 seller | Proven on-chain capability |
| If it fails | You lose a cent | Full escrow reclaimed after expiry | Revoke; scope caps the damage |
| Price | ~$0.01 | $0.10–$5 | Fee on measured performance |

**Exposure is the primary control on the hire screen**, not an implementation detail:

```
How much do you want to give it?
  ○ Just ask it            $0.01     It answers. It touches nothing.
  ● Hire it for this job   $0.50     Escrowed. Paid only on delivery.
  ○ Let it manage this     0.4%      Capped, expiring, revocable in one tap.
```

Nobody else lets the user choose their exposure. Against a field where 87% of institutions name
trust as the blocker, that is the product.

---

## 11. Information architecture

```
/                    THE BOARD — every hireable agent, sortable, four job doors.
                     Connect a wallet and a "for your position" column appears.

/j/[job]             One job's board. Same template ×4, per-category metrics.

/a/[chain]/[id]      The agent. Counterfactual first, then record, then rails.

/hire/[chain]/[id]   The engagement. Rail, exact terms, may/may-not, one signature.

/desk                Your engagements. Live, with projected vs actual tracked.

/register            All 334,770, honest state and a specific reason on every row.

/data                Every number's source. The funnel. The outcome ledger. The API.

/list                List your agent. Self-serve, spec published, Studio on-ramp.
```

Machine surfaces: `/api/v1/*`, `/api/mcp`, `/api/a2a`, `/.well-known/agent-card.json`.

---

## 12. Screen specifications

### 12.1 `/` — the board

No marketing hero. The inventory *is* the homepage — the flap.sh lesson. Four job doors at equal
width above it, each with a live count of what is hireable **right now**, block-stamped.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  BENCH        Board  Register  Data      [/] search   ⌘K    [ List yours ]    │
├──────────────────────────────────────────────────────────────────────────────┤
│  Hire an agent to run your money on BNB Chain.                               │
│  Choose how much it can do. Watch it work. Take it back anytime.             │
│                                                                              │
│  ┌───────────────┐┌───────────────┐┌───────────────┐┌────────────────────┐   │
│  │ Keep an LP    ││ Run a grid    ││ Chase yield   ││ Protect a loan     │   │
│  │ in range      ││               ││               ││                    │   │
│  │ 14 hireable   ││ 9 hireable    ││ 11 hireable   ││ 6 hireable         │   │
│  └───────────────┘└───────────────┘└───────────────┘└────────────────────┘   │
│                                       block 120,417,873 · read 24s ago       │
├──────────────────────────────────────────────────────────────────────────────┤
│  All jobs ▾   Rail ● ● ●   Sort: For your position ▾                         │
├────┬────────────────────┬───────┬──────────────────┬───────────┬─────────────┤
│    │ AGENT              │ RAILS │ TRACK RECORD     │ FOR YOU   │             │
├────┼────────────────────┼───────┼──────────────────┼───────────┼─────────────┤
│ ◈  │ Range Keeper I     │ ▪ ▪ ▪ │ 94.2% in range   │  +$218    │   Hire      │
│    │ bench · 337901     │       │ IL+gas −0.31%    │  30d      │             │
├────┼────────────────────┼───────┼──────────────────┼───────────┼─────────────┤
│ ◈  │ BNB LP Rebalancer  │ ▪ ▪ · │ 81.7% in range   │  +$149    │   Hire      │
│    │ 0x20f1…d64b·265375 │       │ 4 recentres      │  30d      │             │
├────┼────────────────────┼───────┼──────────────────┼───────────┼─────────────┤
│    │ Liquidation Desk   │ · · · │ not measured     │     —     │   Why not   │
│    │ 0x8a2c…91fe·310108 │       │ identical bytes×3│           │             │
└────┴────────────────────┴───────┴──────────────────┴───────────┴─────────────┘
  30,015 agents declare an endpoint. 41 answered ours. → How we count
```

Unhireable rows are **listed, not hidden**, each with the specific reason: `no endpoint`,
`endpoint 404s`, `returns identical bytes to every input`, `card unparseable`. Honesty at the
bottom in muted text, linking `/data`. Never the hero.

### 12.2 `/a/[chain]/[id]` — the agent

Order matters. Counterfactual first, because it is the only thing that answers "should I hire this".

```
Range Keeper I                                    ERC-8004 · 56:337901 ↗

Keeps a PancakeSwap V3 BNB/USDT position earning as the price moves.
Recentres when price leaves the band; does nothing when fees wouldn't cover gas.

┌── On your position, last 30 days ────────────────────────────────────┐
│   +$218        4 recentres · $11 gas · 94% of the window in range    │
│   vs +$38 you actually earned, and $4,196 held un-pooled             │
│   pool 0x36696…9e2a · blocks 118,204,113 → 120,417,873 · method ↓    │
└──────────────────────────────────────────────────────────────────────┘

┌── What it has done for everyone ─────────────────────────────────────┐
│   94.2% time in range        27.4 of 29.1 days observed              │
│   −0.31% IL + gas            crystallised over 4 recentres           │
│   +1.84% fees earned         vs 0.00% un-pooled hold                 │
│   read at block 120,417,873 · 24s ago                                │
└──────────────────────────────────────────────────────────────────────┘

┌── Put it to work ────────────────────────────────────────────────────┐
│   ○ Ask it once           $0.01    Current range assessment.   x402  │
│   ● Hire it for one job   $0.50    Escrowed, paid on delivery. 8183  │
│   ○ Let it manage a range 0.4%     Scoped session, revocable.        │
│                                                    [ Continue ]      │
└──────────────────────────────────────────────────────────────────────┘

▸ What it may and may not do with your money
▸ Every check we ran against the chain
▸ Reputation — 3,000 records, 14 wallets flagged as one cohort
▸ Reproduce every number on this page
```

### 12.3 `/hire` — the engagement

Everything that would otherwise be a second confirmation appears here in English, before the button.
Adopted from gilbertsahumada's hire-plan shape, which is the best in the field: validated quote,
allowlist + expiry check, buyer facts, five typed transaction intents, **exact-approval mode**, an
explicit guardrails block, and `maximumSignatures` declared **before** the user starts.

```
MAY                                MAY NOT
Read your position                 Move funds to any other address
Return a written assessment        Trade, swap, or borrow
Claim $0.50 on delivery            Claim anything without delivering

Escrow          0.50 $U into ERC-8183 escrow
Settlement      Outcome-conditioned: time in range ≥ 90% over 7 days
Dispute window  read from chain: 604,800s (mainnet) · settles 15 Sep 14:22 UTC
If it fails     You reclaim the full 0.50 $U
Custody         Your wallet. We never receive your key.
Signatures      4 (approve not required — allowance sufficient)
```

For Rail 3 the same screen renders scope instead: the allowlist as English clauses generated from
the actual grant, the withheld selectors and why, the daily cap, the expiry countdown, and the
wrapper contract that binds the recipient, linked to verified source.

### 12.4 `/desk` — where the product grades itself

Live engagements with **projected vs actual** side by side. Pause, change cap, revoke. Revoke is
one transaction and the badge desaturates permanently when it lands.

---

## 13. Design system

### 13.1 Direction

A live dispatch board — dark panel, illuminated type, dense rows, numbers that glow. The homepage
*is* the board (the flap.sh lesson: no marketing in front of live inventory). Tables, not cards:
there are hundreds of agents and about forty that deserve attention, and a dense board tells that
truth structurally before a word is read.

Rejected deliberately as generated-design defaults: cream + serif + terracotta; near-black + one
acid accent; broadsheet hairlines and letterpress (MANDATE's look); uniform rounded cards with one
radius and one grey shadow; tracked ALL-CAPS eyebrows; `A · B · C` meta strings; `→` glued to
buttons; and slathering `#F0B90B` everywhere to signal BNB-nativeness, which is the amateur tell.

### 13.2 Colour

```css
--ground     #0A1014   /* deep petrol — a coloured dark, not a tinted near-black */
--panel      #0F171C
--panel-hi   #142027
--rule       #1B262C
--text       #E8EFF2
--muted      #7E9099
--dim        #4A5A63   /* not measured, disabled, absent */
```

**The rail ramp is the entire chromatic system** — three colours encoding escalating exposure,
derived from the product's risk model rather than chosen for decoration:

```css
--rail-call     #5FD4C4   /* teal.  give nothing         */
--rail-hire     #F0B90B   /* gold.  give an escrow       */
--rail-mandate  #FF7A45   /* ember. give authority       */
```

`--rail-hire` is BNB's own gold, used once per row at 12px, on the state that means money is
committed. That is the only relationship to their brand, and it is earned.

Counterfactual gains use `--rail-call` teal; losses use `--rail-mandate` ember. Never red/green —
this is a measurement, not a trading terminal, and colour-blind readers must be able to read it.

Refusals render in `--dim` as absence of light, never in red. Unmeasured renders as the words
`not measured`, never as `0`, never as a blank.

### 13.3 Type

Two families. **Geist Sans** for interface and display — a technical grotesque with real character,
used at 34–44px with `-0.02em` tracking rather than reaching for a decorative serif. **Geist Mono**
for every number, address, hash, block, percentage and duration, with
`font-variant-numeric: tabular-nums`. In a product about measurement, digits that jitter on refresh
destroy credibility instantly, and tabular figures also give CLS 0 for free.

Scale `12 / 14 / 16 / 20 / 25 / 31 / 39`. Body 14–16px, line length ≤ 72ch, sentence case
throughout.

### 13.4 Motion

One orchestrated moment, and it belongs to the thing that matters: **when a probe refreshes, the
rail badge lights** — 220ms bloom to full chroma, then settle, measured against what this reader
last saw so a reload with no change animates nothing.

| Event | Motion | ms |
|---|---|---|
| Probe refresh | Rail badge blooms | 220 |
| Value changed between reads | Single digit rolls vertically | 160 |
| Row hover | Rule brightens only. No scale. | 120 |
| Hire confirmed | Row lifts 8px, moves to `/desk` | 240 |
| Revoke | Badge desaturates permanently | 300 |
| Loading | Hairline pulse on the row. No spinners, no skeletons. | 900 loop |

Forbidden: parallax, scroll-jacking, 3D, gradient meshes, counters that run on load without a data
event, glassmorphism, fade-and-slide-up on every section.
`prefers-reduced-motion: reduce` → all durations 0, all states final. Non-negotiable.

### 13.5 Quality floor, unannounced

LCP < 1.2s. CLS 0. Homepage JS < 90KB gzip, `/hire` < 140KB. Full read path works with JavaScript
off. Visible keyboard focus in `--rail-hire`; `/` focuses search, `⌘K` opens the palette, `j/k`
move row selection. Mobile to 360px: stacked rows, rail column still aligned, four doors stay 2×2
at equal weight. AA+ contrast; `--dim` never carries text that must be read.

### 13.6 Copy

A button says exactly what happens and keeps its name through the flow: `Hire` → `Hired.` Never
`Submit`, never `Success`. Empty states give direction: *"No agent is hireable for this job right
now. 12 are registered and none answered our last probe. You can still call one for $0.01."*
Refusals name the failed condition: *"This agent's endpoint answered but returned identical bytes
to three different inputs. We won't sell you a hire on it."*

---

# Part III — The machine

## 14. Data model

### 14.1 The Measurement primitive

Adopted from Docket, whose measurement discipline is the best in the field, and enforced everywhere
a number renders.

```ts
interface Measurement {
  name: string;
  value: number;
  unit: string;              // "%" | "bps" | "seconds" | "USD"
  numerator?: number;
  denominator?: number;
  window: string;            // "30d rolling"
  observedAt: string;
  block: bigint;             // pinned
  method: string;            // slug into /data
  source: 'chain' | 'probe' | 'registry' | 'bazaar' | 'counterfactual';
}

type Maybe<T> = { known: true; value: T } | { known: false; reason: string };
```

`Maybe` is the discipline: a field is either known with a value, or unknown **with a reason**.
There is no third state. The renderer refuses a `Measurement` missing `block` or `method`.

### 14.2 The Agent record

```ts
interface Agent {
  chainId: 56 | 97;
  tokenId: string;
  registry: Address; owner: Address; agentWallet: Address;
  name: string; description: string;

  category: Maybe<Category>;
  categoryEvidence: string[];

  rails: { call: RailState; hire: RailState; mandate: RailState };

  probe: { at: string; latencyMs: number; status: number; bodyHash: string };
  originHost: string;            // dedup key
  originCohortSize: number;      // the 96.84% problem, made visible

  track: Measurement[];          // category-specific, from chain
  counterfactual?: Counterfactual;  // computed per viewer position
  reputation: Maybe<{ raw: number; filtered: number; flaggedWallets: number }>;
  bazaar: Maybe<{ uniquePayers30d: number; totalCalls30d: number; failRate24h: number }>;

  pricing: { call?: Price; hire?: Price; mandateFeeBps?: number };
  isOurs: boolean;
}

type RailState =
  | { available: true; price: Price; provenAt: string; block: bigint }
  | { available: false; reason: RailRefusal };

type RailRefusal =
  | 'no-endpoint' | 'endpoint-404' | 'endpoint-timeout'
  | 'identical-bytes' | 'card-unparseable' | 'no-402-challenge'
  | 'no-8183-seller' | 'quote-refused' | 'quote-expired'
  | 'no-onchain-capability' | 'unsupported-venue';
```

### 14.3 The Snapshot

Shape from SMEAI, extended with origin cohorts.

```ts
interface Snapshot {
  generatedAt: string;
  cutoff: { block: bigint; observedAt: string };
  pipeline: { chain: 56|97; raw: number; clean: number; relevant: number }[];
  registry: { chainId: number; registered: number; declaringEndpoint: number }[];
  origins: { host: string; count: number; share: number }[];
  totals: { listed; callable; hireable; mandatable; probed; blocked;
            duplicateOrigin; ours: number };
  perCategory: Record<Category,
    { listed; callable; hireable; mandatable; ours: number }>;
}
```

`perCategory` drives the four doors directly. A door with zero hireable says so and offers the
callable count — never an empty door, never a fabricated one.

---

## 15. Trust architecture

Not a score. Scores hide their inputs and invite gaming. **A ladder of binary facts, each with a
proof**, so a buyer can see exactly which rung an agent stands on.

| Rung | Fact | How proven |
|---|---|---|
| 0 | Registered | ERC-8004 `ownerOf` |
| 1 | Card parses | `tokenURI` fetched and parsed |
| 2 | Endpoint answers | HTTP probe, status + latency recorded |
| 3 | **Answers differently to different inputs** | 3 distinct inputs, body hashes compared |
| 4 | Priced | Parseable 402 challenge |
| 5 | Hireable | A **signed** ERC-8183 quote returned |
| 6 | Capable on-chain | Chain shows the wallet using the category's protocols |
| 7 | Paid by strangers | B402 `l30DaysUniquePayers` > 0 |
| 8 | **Measured outcome** | A settled BENCH job with a chain-read result |

Rung 3 is the one nobody checks and it eliminates a large share of the registry — AiKi found agent
310108 returning byte-identical bytes to every input, which a single 200 reads as healthy.
Rung 8 is the moat: only reachable by hiring through BENCH.

**Reputation is filtered before display.** MANDATE's `sybil/detect.ts` (self-review, cardinality,
Jaccard co-review, burst) found 3,000 feedback records written by 32 wallets, 99% by 14 that flag
as one coordinated cohort. Raw and filtered are shown side by side with the flagged count.

---

## 16. Seller economics

A marketplace with no seller side is a directory. Sellers get:

- **Revenue.** Rail 1 per call, Rail 2 per job, Rail 3 performance fee. Paid on chain, no invoice.
- **A dashboard.** Impressions, hire rate, settlement rate, counterfactual accuracy, refusal
  reasons — so a failing agent can be fixed rather than silently buried.
- **Rank transparency.** The ranking function is published on `/data`. Sellers can see exactly why
  they rank where they do. **No paid placement, ever** — the moment ranking is for sale, the
  outcome ledger is worthless.
- **A spec to conform to.** Published, versioned, with a validator at `/list`.
- **The Studio on-ramp.** `bag deploy` → `bench list --from-studio`.

---

## 17. Our own agents

Four, one per category, mainnet, own capital. They exist to guarantee category depth, to give
TermiX something worth hiring, and to prove the rails end to end. They are reference
implementations, not the product.

| Category | Agent | Venue | Metric it produces |
|---|---|---|---|
| Rebalancing | **Range Keeper** | PancakeSwap V3 | % time in range; IL + gas per recentre; fees vs un-pooled hold |
| Grid | **Grid Runner** | PancakeSwap V3 | realized PnL; fills; inventory skew |
| Yield | **Yield Router** | Venus / Aave | net APY captured vs best available; switching-cost payback in days |
| Health | **Health Shield** | Venus | lowest HF reached; repair latency in seconds |

All four serve all three rails, and all four are subject to `OutcomePolicy` — **we take the
strictest settlement terms we offer anyone.**

Rail 1 prices in **USD1**, because neither BSC USDT nor USDC implements EIP-3009 (verified by
checking `authorizationState` and `DOMAIN_SEPARATOR`), so x402's `exact` scheme needs USD1 or $U.

---

## 18. Technical architecture

```
┌───────────────────── BENCH web (Next 15, RSC-first) ──────────────────────┐
│  /  /j/[job]  /a/…  /hire/…  /desk  /register  /data  /list               │
│  /api/v1/*   /api/mcp   /api/a2a   /.well-known/agent-card.json           │
└──────────┬──────────────────────────────────────────┬─────────────────────┘
           │ reads (cached, block-stamped)            │ writes (user's wallet)
┌──────────▼──────────────────────────┐  ┌────────────▼─────────────────────┐
│ WORKER                              │  │ RAILS                            │
│  indexer  ERC-8004 complete sweep   │  │  1  x402 / B402 buyer + seller   │
│  prober   card → call → 3-input     │  │  2  ERC-8183 + OutcomePolicy     │
│  quoter   ERC-8183 signed quotes    │  │  3  Altana session + RecipientBound
│  metrics  per-category chain reads  │  └──────────────────────────────────┘
│  counter  counterfactual replay     │
│  bazaar   B402 ingest               │  ┌──────────────────────────────────┐
│  origins  cohort clustering         │  │ CONTRACTS                        │
│  ledger   outcome recording         │  │  RecipientBound.sol              │
└──────────┬──────────────────────────┘  │  OutcomePolicy.sol + oracles     │
           │                             └──────────────────────────────────┘
     ┌─────▼──────┐        BNB Smart Chain (56)
     │ Postgres   │        ERC-8004 · ERC-8183 · Altana Keystore
     │ (chain,id) │        PancakeSwap V3 · Venus · x402/B402
     └────────────┘
```

**Stack:** Next 15 / React 19 RSC-first; Tailwind v4 with the §13 tokens as CSS vars; viem;
`@altananetwork/sdk` for sessions and ERC-8183 (both halves); `@bnbagent/sdk` for the commerce
client; Postgres + Drizzle; Node worker; Solidity 0.8.28 + Foundry.

### CI gates that enforce the plan

| Gate | Fails when |
|---|---|
| `diversity` | Any job route has fewer metric fields, fewer components, or zero hireable rows than the others |
| `measurement` | Any rendered number lacks `block` or `method` |
| `absence` | Any `Maybe` unknown renders as `0` or empty |
| `no-lookahead` | A counterfactual result changes when fed a future tick |
| `network` | Chain 56 and 97 figures appear in one aggregate |
| `ranking` | A first-party agent outranks a better-measured third-party agent |
| `routes` | Any link in any README or page 404s against production |
| `budget` | Homepage JS > 90KB gzip, `/hire` > 140KB, LCP > 1.2s |
| `smoke` | Every route, funnel freshness and all three rails, every 15 min against production |

`routes` and `ranking` matter most. MANDATE shipped a README documenting four 404s, and the entire
failure mode of this category is a marketplace that quietly favours its own supply.

---

## 19. What ports from MANDATE

Audited module by module. **~4,000 lines port. ~10,000 go.** Imported as a labelled vendor drop
with a provenance note, not as heritage.

**Ports:**

| Module | LOC | Why |
|---|---|---|
| `chain/session.ts` | 650 | Rail 3, ~80% done: `CATEGORY_CALLS` with real mainnet addresses for all four categories, `WRAPPER_ROUTE` signature-to-signature, `grantMandateSession`, `revokeMandateSession`, `pauseMandateSession`, `findRegistrationTx` with block-pinned Keystore proof, `describeAllowlist` |
| `chain/valuation/*` | 1,844 | V3 tickmath, Venus supply **and** borrow, MasterChef, prices. Refuses rather than approximates. **Powers the counterfactual engine.** |
| `chain/logs.ts` | 118 | Parallel log walker with measured provider limits; counts refused ranges instead of presenting holes as empty. **Powers tick-history reconstruction.** |
| `chain/scope.ts` | 253 | ProvenScope, Porto wildcard-sentinel guard |
| `chain/allowlist.ts` | 249 | The leash |
| `agents/*` | ~950 | `Strategy` as a pure function of chain state — **the reason the counterfactual is possible** |
| `x402/index.ts` | 246 | Rail 1: challenge, verify, settle, USD1 domain |
| `sybil/detect.ts` | 274 | Reputation filtering |
| `mcp/*` | 621 | Machine surface |
| `worker/*` | 338 | Indexer, prober |
| `RecipientBound.sol` | 435 | Recipient binding |
| `prove-session-scope.ts`, `prove-hire-flow.ts` | — | Already written |

**Deleted:** `MandateMarketV2` (1,042), `MandateMarket` (792), `AssayBond` (371), `ShadowLedger`
(287), `Underwriter` (252), `abiV2.ts` (2,330), most of `abi.ts` (1,534), `market/book/standings`
(668), the fineness scoring (~1,060), `mandate-verify` (1,824). Plus the entire vocabulary —
fineness, hallmark, assay office, rung *as brand*, millesimal, sponsor mark, date letter — the
ladder-as-navigation, the register-as-homepage, the WebGL floor, Greenfield attestations, and both
competing design systems.

**The one idea that survives transformed:** `MandateMarketV2`'s benchmark logic (`Hold`,
`BestPassiveRate`, `LiquidationAvoided`), its two-observation alpha derivation and ±2bps rounding
tolerance. It was sound logic in the wrong container. It becomes the counterfactual benchmark set
(§5.4) and the `OutcomePolicy` oracle (§6.2).

---

# Part IV — Execution

## 20. Build order

Sequenced by dependency and by gap created, not by calendar. Each phase is independently demoable
with a hard exit criterion.

### P0 — The spine
Route tree, tokens, `Measurement`/`Maybe`, the board, four doors. Complete ERC-8004 sweep. Prober
does card-fetch, endpoint-call and the three-input identity check. B402 Bazaar ingested.
**Exit:** a stranger lands, picks a job, sees real agents with real freshness, opens an agent page.
JS < 90KB, LCP < 1.2s, reads with JavaScript off.

### P1 — Rail 1
x402/B402 buyer against third-party agents. Our agents expose paid `/status`.
**Exit:** a stranger pays $0.01 and gets an answer from an agent we do not operate.

### P2 — Rail 3
Port `session.ts`. Deploy and verify `RecipientBound`. Passkey account. Grant from `/hire`,
Keystore-registered, may/may-not generated from `describeAllowlist`. Revoke in `/desk`.
**Exit:** grant → agent acts → revoke → identical call refused, on mainnet, from the product.
`prove-scope` green, output published. *(This is where the largest gap opens: the main-track leader
has no session rail at all.)*

### P3 — Rail 2
Full ERC-8183 lifecycle. Testnet closes the loop end to end (900s window). Mainnet runs to
fund + submit with `disputeWindow()` **read from chain** and the time-locked refusal printed
verbatim. Deliverable fetched and keccak-verified against the on-chain commitment.
**Exit:** a stranger hires an agent we do not operate; the deliverable verifies; the loop closes on
testnet and the mainnet job is in flight with its settlement date displayed.

### P4 — The counterfactual engine
`packages/counterfactual`. Tick-history walk, replay, simulate, cost, compare, attest. No-lookahead
test. The "for your position" column and the agent-page headline.
**Exit:** connect a wallet, see what three agents would have done to your real position in dollars,
with a reproduce command that regenerates the number.

### P5 — Depth
Four category metrics computed from chain. Origin-cohort dedup. `/register` virtualised. `/data`
with the funnel, the concentration finding and the methods. Public API, MCP, A2A, `/list`, our own
agent card. Agent Advantage Report generated from real runs.
**Exit:** an informed hiring decision is possible from a board row alone; all four categories pass
the `diversity` gate.

### P6 — `OutcomePolicy`
Contract, oracles, tests, audit pass. Opt-in for health factor first, then rebalancing. Default for
our own agents.
**Exit:** a job settles on a measured outcome with neither party clicking anything.

### P7 — Supply and usage
Studio on-ramp (`bench list --from-studio`). Seller dashboard. Other teams listed. Public usage
counter, honest at zero. Uptime monitoring.
**Exit:** distinct non-team wallets have transacted on all three rails, and third-party operators
have listed themselves.

### P8 — Polish
The single motion moment. a11y audit. Mobile to 360px. Copy pass. Chanel rule: remove one thing
from every screen.

---

## 21. The proof artifacts

Ten things that must be true on the deployed site. This is the submission.

1. A stranger pays $0.01 and gets an answer from an agent we do not operate. **(mainnet, done)**
2. A mainnet Altana session, Keystore-registered, visible in the Altana explorer.
3. `prove-scope`: grant → in-scope succeeds → out-of-scope refused → revoke → same call fails.
4. `RecipientBound` deployed and source-verified, used under every Pancake call.
5. An ERC-8183 job hired from the product; deliverable keccak-verified; loop closed on testnet.
6. A mainnet ERC-8183 job funded, with its chain-read settlement date displayed.
7. A counterfactual on a real user position, with a reproduce command.
8. Four categories, each with a first-party agent and a category-specific chain-read metric.
9. The funnel and the 96.84% origin concentration, block-pinned, with method.
10. An agent hires from BENCH over MCP with no browser.

## 22. Partner tracks

**Altana (50,000 XP).** Rail 3 *is* their specification, and their own "Ideas to Build" table opens
with *"Agent hiring marketplace — hires and pays other agents, escrow handled — ERC-8183 buyer
side, `hireErc8183Agent`."* We satisfy every qualification line — agents on their own Altana
wallets, allowlist + cap + expiry, Keystore-registered, real mainnet transactions through a session
key, in-product revoke — plus both bonuses. The main-track leader has no session rail at all.

**TermiX ($6,000).** They hire cold, without instructions. Rail 1 open at $0.01 is the cheapest
possible way for them to transact — Docket's paid path was *closed at admission*, so TermiX
literally could not hire from it. Their 30% "proven agent advantage" is the counterfactual engine
pointed at four tasks, at least one from trading or security.

**PancakeSwap (1,000 CAKE).** Range Keeper and Grid Runner on V3, with `RecipientBound` making the
custody boundary a *binding* rather than an isolation assumption. Their brief asks for *"executing
safe automated swaps using PancakeSwap products without ever putting user funds at risk"* — a
recipient written from immutable storage answers that more literally than anything else in the
field. Plus a pool-demand research endpoint sold over x402, answering their liquidity-efficiency
line. The main-track leader has zero PancakeSwap files.

## 23. Day one of adoption

What BNB Chain receives if they take it:

- A deployed product with real users and real transactions on all three rails.
- The buyer half of Agent Studio, with a CLI on-ramp from `bag deploy`.
- A complete, continuously refreshed index of every ERC-8004 agent on BSC, with honest state.
- The only outcome dataset in the ecosystem, and an open API over it.
- A settlement policy contract other marketplaces can adopt.
- A team that has published its own failures — expired sessions, wrong valuations, losing
  windows — which is what makes the rest of the numbers worth believing.
- A codebase with CI gates that enforce the product's honesty rules, so it does not rot when we
  are not looking.

Not a hackathon demo. A product with a maintenance story.

## 24. Anti-drift rules

The last two rebuilds failed to the same pattern: when the hard thing was ambiguous and the
beautiful thing was tractable, the beautiful thing got built. First it was 5,446 lines of settlement
Solidity. Then it was a command palette and digit-roll animations while Rail 2 sat unfinished.

1. **No feature ships unless it sits on `land → find → understand → hire`.** If you cannot name the
   step, it does not get built.
2. **Rails before polish.** No design work while a rail is incomplete.
3. **Weekly stranger test.** Someone who has never heard of ERC-8004 tries to hire something. Where
   they stall is the only bug that matters that week.
4. **Our agents never outrank a better third-party agent.** Enforced in code, unit-tested, stated
   publicly.
5. **Publish the losses.** Our forecast errors, our agents' losing windows, our expired sessions.
   This is the only credential that cannot be faked.
6. **If it is impressive but a judge would not touch it, it is not product.**

## 25. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Counterfactual is slow or log providers refuse ranges | **High** | Precompute per pool on a schedule, not per request. Cache by `(pool, blockRange)`. Declare partial history rather than interpolating. Budget for a paid log provider — only one public BSC endpoint serves ranges, capped at 5,000 blocks. |
| Counterfactual is wrong and someone loses money on it | **High impact** | No-lookahead test in CI. Gas at observed prices. Slippage bounded by real pool depth. Losses shown at equal weight. Every result reproducible. Framed as "would have", never "will". |
| Third-party ERC-8183 supply is near zero | **High** — only 14 agents on BSC declare `erc8183Only`, 4 declare both | Rail 1 carries the third-party proof; it has real supply. Recruit other hackathon teams as Rail 2 counterparties. Our own seller endpoint makes the rail exercisable regardless. |
| Mainnet 7-day dispute window | Certain | Read `disputeWindow()` from chain, show the settlement date, close the loop on testnet's 900s window, and fund a mainnet job early so it settles inside the judging period. |
| Real capital on mainnet | Medium | Small positions, hard daily caps, fail-closed sessions, `RecipientBound` under every Pancake call, `prove-scope` before funding. Our agents lose their rail badges when they fail. |
| Session expiry lapses during judging | Medium — **it happened last time** | Expiries far past the window, monitored by the 15-minute smoke job, and `/desk` reports a lapsed session as lapsed rather than live. |
| Scope creep back toward the capital market | **High — it is the team's instinct** | Rules 1 and 6. The deletion list in §19 is binding. |

---

## Appendix A — addresses and chain facts

```
ERC-8004 Identity Registry      0x8004a169fb4a3325136eb29fa0ceb6d2e539a432
ERC-8004 Reputation Registry    0x8004baa17c55a88189ae136b182e5fda19de9b63
PancakeSwap V3 PositionManager  0x46A15B0b27311cedF172AB29E4f4766fbE7F4364
PancakeSwap V3 SwapRouter       0x13f4EA83D0bd40E75C8222255bc855a974568Dd4
PancakeSwap V2 Router           0x10ED43C718714eb63d5aA57B78B54704E256024E
MasterChef V3                   0x556b9306565093c855aea9ae92a594704c2cd59e
Venus Comptroller               0xfD36E2c2a6789Db23113685031d7F16329158384
Venus vBNB                      0xa07c5b74c9b40447a954e1466938b865b6bbea36
WBNB                            0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
USDT (BSC-USD, 18 decimals)     0x55d398326f99059fF775485246999027B3197955
USD1 (EIP-3009 capable)         0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d
$U testnet faucet (chain 97)    0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3
```

**Quirks that break naive integrations** — all verified, several the hard way:

- USDT on BNB Chain has **18 decimals**, not 6.
- PancakeSwap routers emit **no events of their own**; the `Swap` comes from the pool. A capability
  scan looking for logs emitted *by* the router finds nothing, forever.
- Trailing `null`s in an `eth_getLogs` topic filter silently return zero results and do not error.
- Neither BSC USDT nor USDC implements EIP-3009. x402's `exact` scheme needs USD1 or $U.
- ERC-8183 `disputeWindow()`: **604,800s mainnet, 900s testnet.** Read it, never hardcode it.
- Only one public BSC endpoint reliably serves log ranges, capped at 5,000 blocks. Budget for a
  paid provider before building anything that walks history.
- Porto wildcard sentinels (`0x3232…`) silently convert a scoped grant into an unrestricted one.
  Guard against them explicitly.

## Appendix B — the sentence this has to earn

> *"We asked for one venue where someone can find an agent and hire it. BENCH reads the whole
> registry, tells you honestly which agents are actually reachable, shows you in dollars what each
> one would have done to your own position, and lets you put any of them to work at a level of
> authority you choose — a cent for an answer, an escrow for a job, or a capped session you can
> revoke in a tap. It works for agents we didn't build, from a wallet we don't hold. Then it
> publishes what actually happened. That is the front door, and we should own it."*

If that is true on the deployed site, nothing else in the field is close.