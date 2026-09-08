# BENCH — Full Rebuild Plan

**The place where any agent on BNB Chain can be put to work.**

A complete restart for BNB Chain's *The Smart Money Era: Build the Era*. New repository, new
name, new product. This document is the whole plan: what we are building, why, what we take
from the field, what we delete, how it looks, how it is built, and in what order.

Written after reading BNB Chain's hackathon page, launch blog, AI Agent Landscape report,
Agent Studio docs and product page, the Altana SDK and Skills Registry, Binance's B402 Bazaar
docs, and the source of all 65 public competitor repositories.

---

## Contents

1. [The one sentence](#1-the-one-sentence)
2. [Post-mortem: why the last build lost](#2-post-mortem-why-the-last-build-lost)
3. [What BNB Chain is actually buying](#3-what-bnb-chain-is-actually-buying)
4. [The rubric, decomposed into build targets](#4-the-rubric-decomposed-into-build-targets)
5. [The field: what exists and what we take from it](#5-the-field-what-exists-and-what-we-take-from-it)
6. [Product thesis: three rails of authority](#6-product-thesis-three-rails-of-authority)
7. [Name, brand, positioning](#7-name-brand-positioning)
8. [Information architecture](#8-information-architecture)
9. [Design system](#9-design-system)
10. [Screen-by-screen specification](#10-screen-by-screen-specification)
11. [The data model](#11-the-data-model)
12. [Supply: how the board fills](#12-supply-how-the-board-fills)
13. [Our own agents](#13-our-own-agents)
14. [Technical architecture](#14-technical-architecture)
15. [What we port, what we delete](#15-what-we-port-what-we-delete)
16. [Partner tracks, designed in](#16-partner-tracks-designed-in)
17. [Build order](#17-build-order)
18. [The judge journey](#18-the-judge-journey)
19. [Anti-drift rules](#19-anti-drift-rules)
20. [Risk register](#20-risk-register)
21. [Appendix A — contract addresses](#appendix-a--contract-addresses)
22. [Appendix B — public API](#appendix-b--public-api)
23. [Appendix C — repository layout](#appendix-c--repository-layout)

---

## 1. The one sentence

> **BENCH is where you hire an agent to do a job with your money on BNB Chain — and the
> amount of authority you hand over is the thing you choose, not the thing you hope about.**

Three ways to put an agent to work, in ascending order of what you give up:

- **Call it.** Pay a cent, get an answer. It touches nothing.
- **Hire it.** Fund an escrow it can only open by delivering. It holds no key of yours.
- **Mandate it.** Grant a scoped, capped, expiring session over one position. Revoke in a tap.

Any agent on BSC can be reached by at least one of these. That is what makes this a
marketplace rather than a shop.

---

## 2. Post-mortem: why the last build lost

MANDATE answered a question BNB Chain did not ask.

They asked: *how does someone find an agent and hire it?*
We answered: *how do you make an agent financially accountable for losing your money?*

The answer was genuinely excellent — a staked, challengeable settlement market with bonds,
slashing, dismissal-with-succession-in-one-transaction, an assay engine scoring agents in
millesimal fineness, sybil-filtered reputation, and an isolated on-chain verifier. Nothing
else in the field is close to it technically.

It lost the brief for five specific, diagnosable reasons:

| Failure | Evidence in the repo |
|---|---|
| **The front door critiqued the registry instead of selling a job.** | Homepage opened on the funnel/ladder: "303,391 registered, 5 answered." That is a finding, not a shop. |
| **The hire path led back to ourselves.** | Four house agents. `DONE.md` marks "A marketplace" as *partial* because no third-party hire ever landed on chain. |
| **Effort went to the mechanism, not the journey.** | 5,446 lines of Solidity for bond/slash/dismiss. Zero lines that let a stranger hire somebody else's agent. |
| **Vocabulary the user does not have.** | Fineness, hallmark, assay, rung, office, millesimal, base metal. The rubric says *"someone with zero Agent Studio knowledge."* |
| **Documentation outran production.** | README's own site table listed `/agent/[id]`, `/mandate/[id]`, `/floor`, `/authority` — all 404 in the shipped app. Four house sessions had been expired for two days. |

**And the rebuild made it worse** because it tried to keep the moat. The moat was the thing
pulling us off-brief. Three IA generations got layered on top of each other, two contradictory
design systems shipped simultaneously (`BRAND.md` says dark/gold/tables-not-cards, `globals.css`
implements light/blue/cards), and the product ended up as neither the assay office it was
designed as nor the marketplace it was rebuilt as.

**The lesson, stated once so it governs everything below:** a capital market is a *second*
product a marketplace might grow into. It cannot be the front door. We are building the front
door. Everything else waits.

---

## 3. What BNB Chain is actually buying

### 3.1 Their words

> "Build the best AI agent marketplace on BNB Smart Chain: one venue to browse agents, see what
> they do and how they've performed, and put them to work. **We're asking for the marketplace
> itself, not a portfolio of agents, and the measure that matters most is how easily someone can
> find an agent and hire it.**"

> "Agents registered under ERC-8004 already carry an onchain identity and a track record other
> software can look up; **your job is to make that legible to a person deciding who to hire.**"

> "Adoption means we back it as a standalone product with its own brand and team, and incubate it
> as the discoverability layer for agents on BSC."

This is a product acquisition. They are hiring a team and a codebase, not awarding a prize.
Design for the question *"can we run this in six months without being embarrassed?"*

### 3.2 The gap in their own stack

BNB Agent Studio is a **seller-side factory with no shop**. Its own documentation says so:

> "v0.0.1 is seller-only. The CLI (`bag`), runtime library, read-only MCP server, and IDE skills
> ship today. **Buyer product flows and a hosted console are deferred to v2.**"

Its product page is all supply: *"Prompt in. Agent out."*, *"Your agent charges for its work.
You collect."* Its roadmap is a developer dashboard, key security, expanding supply. There is
no buyer surface anywhere on it.

And their landscape report names the consequence in their own voice:

> "**The identity base is large but application-level demand, the volume of real work agents pay
> for, still has to be proven.** Naming the gaps is part of reading the data honestly."

**BENCH is the buyer side of BNB Agent Studio.** That is the sentence the whole product exists
to make true, and it is why adoption is on the table at all.

### 3.3 Their analytical framework

From the AI Agent Landscape report, an agent economy needs four things. We should map cleanly
onto all four, and be visibly the demand-side answer to the fourth:

| Their pillar | What exists on BSC | Where BENCH sits |
|---|---|---|
| **Identity** | ERC-8004, BAP-578, BAS Agent Passport | We read it, probe it, and render it |
| **Capability** | Agent Studio, BNBAgent SDK, model gateways | We prove it from chain evidence before granting authority |
| **Payment** | x402 / B402, Binance Pay, $U, USD1 | Rails 1 and 2 settle here |
| **Accountability** | ERC-8004 reputation, attestations | We publish measured outcomes, not self-reports |

### 3.4 How they write, and why it matters

BNB Chain's own prose separates measured from qualitative, states methodology, and names gaps
plainly: *"Keep the quantitative and qualitative separate."* / *"Naming the gaps is part of
reading the data honestly."*

That is our register too. Not because honesty is a brand — the last project made honesty the
*product* and that was the mistake — but because it is the house style of the organisation
deciding. Carry it in the data, not in the marketing.

### 3.5 Rules of their house

- Their brand guidelines restrict "Official", "Partnering", "Collaborating", and logo use that
  implies endorsement. Most of the field violates this. We say **"Built on BNB Chain"** once, in
  the footer, small.
- No fake metrics, no five-star ratings, no testimonials.

---

## 4. The rubric, decomposed into build targets

Three published criteria, three judges scoring independently. Plus a redacted Phase 2.

### Functionality

> "The full journey works end to end: land, find an agent by category, understand what it does,
> activate it, with minimal friction. Someone with zero Agent Studio knowledge should be able to
> get through it without hitting a dead end."

**Build targets:**
- Homepage → board → agent → hire, in four clicks, no wallet needed until the last one.
- Every list has at least one hireable row. No empty state without a next action.
- Zero jargon on the path. "Keep an LP in range", not "concentrated liquidity range management".
- Every listing that *cannot* be hired says the specific reason: `no endpoint`, `endpoint 404s`,
  `returns identical bytes to every input`, `card unparseable`.
- Server-rendered. Readable with JavaScript off.

### Data Quality

> "Real-time, accurate data that goes beyond basic counts. A user should be able to look at what
> you're showing and make a genuinely informed call on which agent to hire."

**Build targets:** every figure on a card answers five questions —

1. Can I hire it right now? (rail badges + probe age in seconds)
2. What has it actually done? (category-specific realized metric, from chain)
3. What does it cost? (per call / per job / fee on mandate)
4. What can it do to my money? (may / may-not, generated from the actual grant)
5. How fresh is this, and what is unknown? (block + age; `not measured` never renders as `0`)

Every number carries `{value, unit, numerator, denominator, window, observedAt, block, method}`.

### Agent Diversity

> "All four categories (rebalancing, grid trading, yield, health factor) surfaced with equal
> depth. A submission that treats one category as the main event and the rest as an afterthought
> won't score well here."

**Build targets:**
- Four doors at equal visual weight above the board, on the front page.
- Per-category live counts of `listed / callable / hireable / mandatable`, block-stamped.
- Two first-party reference agents per category, all eight on mainnet.
- Category-specific metrics — not one generic score reused four times.
- A CI check that fails the build if any category's route, metric set, or agent count is thinner
  than the others.

### The unpublished fourth criterion

The launch press said submissions would be scored on *"functionality, data quality, agent
diversity, **and real-world usage**."* The published rubric omits usage. The timeline lists a
public top-3 shortlist, then **Phase 2: [REDACTED]**, then the winner.

**Conclusion:** Phase 2 is almost certainly real-world usage, measured live between shortlist
and announcement. Design for it from day one — instrumentation, uptime, and a public usage
counter that is honest when it is zero.

### Eligibility (hard gates, not scores)

- Functional and publicly accessible **during judging**.
- **Agents surfaced on your marketplace must be live on BSC.**
- One entry per team.

---

## 5. The field: what exists and what we take from it

65 public repositories analysed at source level. The honest funnel:

```
65 repos
→ ~40 with more than 2,000 lines of real code
→ ~20 covering all four categories with anything like equal depth
→ ~12 with a hire or activation path in code rather than a button
→  ~7 meaningfully on mainnet rather than chain 97
→   2 that can hire an agent the team does not operate
```

### 5.1 The five that matter

**gilbertsahumada/agent-marketplace (trust8004.xyz)** — the most literal execution of the brief
and the most underrated project in the field. Complete registry sweep: 334,770 agents, 160 pages
at 2,000/page, `"complete": true`, block-pinned, with rate-limit headers preserved in the
evidence file. Generic ERC-8183 escrow hire against arbitrary sellers on both mainnet and
testnet. ~101k LOC, 22k of it tests. API + MCP + CLI + seller docs.
*Weakness:* a directory plus an escrow rail, with no product taste, no session rail, no
first-party supply, and registry-derived rather than execution-derived data.

**san-npm/agripinaa** — the best *product*. Eight mainnet ERC-8004 agents, exactly two per
category. Passkey Altana activation, no seed phrase. Real execution through Ophis batch auctions
with surplus-vs-signed-limit in bps. A drain-proof `AgripinaaYieldRouter` with hardcoded
recipients and three zero-argument selectors.
*Weakness, confirmed at code level:* `apps/web/src/lib/activatable.ts` contains
`export function agentSupportsSessionHandoff(): boolean { return false; }`. Activation requires
`consumesSession || (endpointLive && sessionHandoffSupported)`, so **only their own eight agents
can ever be hired.** It is a boutique with an index bolted on — precisely what the brief warns
against.

**Ridwannurudeen/docket** — the best measurement methodology anywhere in the field. Every figure
carries numerator, denominator, observation window and method, enforced across 25 modules. Four
mainnet ERC-8004 agents, one per category. Pure mainnet, zero testnet references.
*Weakness:* by its own README, no service holds a session key, a signer, or a transaction
submitter. It measures beautifully and cannot hire.

**iamdflame/mandate-bnb (ours)** — the only real capital market. Covered in §2.

**Immadominion/AiKi** — the deepest custody stack, and notably *not* Altana: 4,840 lines of
Solidity implementing six ERC-7710 caveat enforcers (AllowedTargets, AllowedSelectors,
PerActionCap, SessionTotalCap, AssetScope, Expiry) plus its own DelegationManager and mandate
account, redeemed through MetaMask's audited DelegationManager "so the limit holds even against
us." Its Agent Advantage Report is a runnable script making live calls.

### 5.2 What we steal, precisely

| From | What we take | Why |
|---|---|---|
| **gilbertsahumada** | The whole ERC-8183 hire-plan shape: `validateQuote` → `assertAllowedQuote(allowlist, now)` → `getBuyerFacts` → 5 typed transaction intents (`createJob`, `registerJob`, `setBudget`, `approve`, `fund`), exact-approval mode, `deadline = now + disputeWindow + 1h`, a `guardrails` object naming the custody model, and `maximumSignatures` declared before the user starts. | This is Rail 2. It is the single highest-value pattern in the field and it solves "hire a stranger's agent safely". |
| **gilbertsahumada** | The funnel artifact: two block-pinned snapshots a week apart, with source params and rate-limit headers preserved. | Data Quality evidence that cannot be faked. |
| **Agripinaa** | The `surplus.ts` execution-quality engine: exact rational bigint surplus vs the signed limit, partial-fill scaling, `null` on malformed rather than `0`. | Turns "how has it performed" from a claim into a measurement. |
| **Agripinaa** | Two-agents-per-category as the diversity structure, and the passkey-first activation with no seed phrase. | The cleanest Agent Diversity answer in the field, and the lowest-friction activation. |
| **Docket** | The `Metric` primitive: `{name, unit, numerator, denominator, window, observedAt, method}` plus per-service `limitations`. | This *is* Data Quality. Adopt verbatim as a type. |
| **SMEAI** | The snapshot shape: `pipeline{raw→clean→relevant}`, `totals{live, hireable, services_checked, quotes, cloned, clusters, endpoints_probed, endpoints_blocked}`, and **`per_category{total, live, hireable, ours}`**. | Per-category live/hireable counts are exactly what the four doors need. |
| **SMEAI** | Double-probe: fetch the agent card, then actually call the service. | "Calls every agent before it lists it" is the right listing gate. |
| **AiKi** | Caveat-enforcer decomposition as the mental model for a grant, and the honest-projection rule: unmeasured fields are `null` by construction. Their finding style too (agent 310108 returns byte-identical bytes to every input). | Makes the may/may-not table a computed artifact rather than prose. |
| **VEYRA** | `proveSessionScope` as a shipped script: grant → in-scope succeeds → out-of-scope refused → revoke → same call now fails. Six assertions, real chain. | A claim about what an agent *cannot* do is worth nothing unless it is exercised. |
| **wyka0** | Chain isolation enforced at the data layer (never client filtering), invalid network fails closed to mainnet, bounded 4-second registry timeout with an explicit "registry unavailable" state. | Never mix 56 and 97 in one number. |
| **PositionCrew** | The explicit *refusal*: when a job cannot be done safely, return the failed condition, not a toast and not a 500. | Refusals are a feature of a hiring product. |
| **Kawal** | Serving the same marketplace over MCP and A2A so an agent can hire from it. | Machine-facing front door; cheap once the API exists. |
| **B402 Bazaar** (Binance) | Ingest it as a supply source. Opt-in, free, indexed ~30s after first settle, CDP-blob-compatible, and it already computes `fail_rate_24h`, `l30DaysTotalCalls`, `l30DaysUniquePayers`. | Free real usage data on real paid services. **Nobody in the field used it.** |
| **Altana Skills Registry** | The `may` / `may not` table shape, and the framing: *"A session gives your agent authority. A skill gives it competence."* | The exact vocabulary for the hire screen. |
| **flap.sh** | The board-as-homepage: no marketing hero, sortable dense rows, thumbnails, tag chips, live deltas, trending strip, create CTA in nav. | Our visual and structural reference. |

### 5.3 The finding that is ours alone

From gilbertsahumada's 4 September funnel, cross-checked against their 27 August snapshot:

```
registered agents on BSC ............ 334,770
  declaring any endpoint ...........  30,015   (9.0%)
  of which resolve to
  platform-backend.prod.termix.live   29,067   (96.84% of all declared endpoints)
  next largest host (singularry) ....     240   (0.80%)
  httpUnreachable metadata ......... 124,937   (up from 109,506 eight days earlier)
```

**97% of every agent on BNB Chain that declares an endpoint points at one company's backend —
and that company, TermiX, is one of the hackathon's judges.**

This is not an attack line. It is the single most important fact about the supply we are being
asked to make discoverable, and it dictates product decisions:

- A marketplace that renders "334,770 agents" as inventory is lying by aggregation.
- A marketplace that ranks by count will rank one operator's batch registration at the top.
- **Deduplication by endpoint origin is a first-class feature**, not a nice-to-have.
- The honest number to lead with is *hireable right now*, which is in the low hundreds.

We will publish this as a measurement with its method on `/data`, in BNB Chain's own register:
stated plainly, sourced, and without editorial.

---

## 6. Product thesis: three rails of authority

### 6.1 The wall everyone hit

Every serious team in this field hit the same wall: **you cannot safely hand a session key to a
stranger's agent.** A session key binds a target and four selector bytes. It cannot bind an
argument. So granting `mint(...)` on PancakeSwap's position manager grants it with *any*
recipient.

- Agripinaa hit it and hardcoded `agentSupportsSessionHandoff() → false`, becoming a boutique.
- Docket hit it and shipped no signer at all.
- MANDATE hit it, solved it with `RecipientBound` — and then never landed a third-party hire.

The wall is an artifact of assuming there is **one** way to hire. There are three.

### 6.2 The three rails

| | **Rail 1 — Call** | **Rail 2 — Hire** | **Rail 3 — Mandate** |
|---|---|---|---|
| You give | Nothing. A payment. | An escrow it must earn. | Scoped standing authority. |
| It holds | No key, no funds | No key. Funds locked in a contract. | A session key, capped and expiring. |
| Standard | x402 / B402 | ERC-8183 job escrow | Altana session + `RecipientBound` |
| Works with | Any agent with a live paid endpoint | Any agent implementing the ERC-8183 seller side | Agents with proven on-chain capability on the venue |
| Failure mode | You lose a cent | Escrow reclaimed in full after expiry | Revoke; scope caps the blast radius |
| Reversible | n/a | Dispute window | One transaction, immediate |
| Typical price | $0.01 | $0.10–$5 | Fee on performance |

### 6.3 Why Rail 2 is the unlock

Altana's SDK ships **both halves** of ERC-8183. `hireErc8183Agent` runs `createJob` →
`registerJob` → `setBudget` → `approve $U` → `fund` as one atomic relay intent. The deliverable
is committed on chain as `keccak256` of the canonical manifest and hash-verified before you trust
the content. If the seller never delivers, the buyer reclaims the full escrow after expiry. The
session-key path works too, so a scoped key with an on-chain spend limit caps what an autonomous
agent can ever escrow.

**You never hand a stranger a key. You hand them an escrow they can only open by doing the work.**

That is how a marketplace hires agents it does not operate. It is why a three-rail marketplace is
structurally a marketplace, and a session-only marketplace always collapses into a portfolio.

### 6.4 The ladder as the user's choice

The rails are not an implementation detail. They are the **primary control on the hire screen**:

```
How much do you want to give it?

  ○ Just ask it            $0.01     It answers. It touches nothing.
  ● Hire it for this job   $0.50     Escrowed. It gets paid only if it delivers.
  ○ Let it manage this     0.4% fee  Standing permission, capped, expiring, revocable.
```

Nobody else in this hackathon lets the user choose their exposure. It is the product's spine and
its most defensible idea.

---

## 7. Name, brand, positioning

### 7.1 Name

**BENCH.**

- *Hire off the bench.* A bench is where available talent waits to be picked — exactly what a
  marketplace of idle agents is.
- **Benchmark** lives inside the word, tying the brand to the Data Quality criterion.
- One syllable, five letters, no collisions in this field (two teams used MANDATE, two used Assay).
- Sits naturally beside BNB Chain's own naming: *Agent Studio builds it. Bench is where you hire it.*

Alternatives if BENCH is unavailable: **ROSTER** (warmer, no reserves connotation), **DISPATCH**
(implies live operations and recall), **RETAINER** (accurate to Rail 3, too formal for a front door).

Domain target: `bench.sh` / `bnbbench.xyz` / `hirebench.xyz`. Repo: `bench` or `bench-bnb`.

### 7.2 Positioning line

> **Hire an agent to run your money on BNB Chain.**
> Choose how much it can do. Watch it work. Take it back anytime.

### 7.3 What we never say

No "Official", "Partnering", "Collaborating". No BNB logo as endorsement. "Built on BNB Chain"
once, in the footer, small. No emoji, no exclamation marks, no five-star ratings, no testimonials,
no "revolutionary", no "seamless".

### 7.4 The four-second test

Open BENCH beside agripinaa.vercel.app and marketplace.trust8004.xyz. A person who knows nothing
should say: *"that one is a place I can hire something; those are directories."* If they say
"three marketplaces", the design has failed.

---

## 8. Information architecture

Eight routes. The last build had fourteen plus a README documenting four that 404'd.

```
/                    THE BOARD. Every hireable agent, sortable, filterable by job.
                     No marketing hero. The inventory is the homepage.

/j/[job]             One job's board. rebalancing · grid · yield · health
                     Same template ×4, identical depth, different metric column.

/a/[chain]/[id]      The agent. What it does · what it has done · how to hire it.

/hire/[chain]/[id]   The engagement. Pick a rail, see exact terms, one signature.

/desk                Your engagements. Live status, what they did, pause, revoke.

/register            The full 334k, honest state on every row, search any token id.

/data                Where every number comes from. Methods, funnel, open API.

/list                List your agent. Self-serve, any operator.
```

Plus machine surfaces, not navigation:

```
/api/v1/*            Public, unauthenticated, CORS-open, rate-limited.
/api/mcp             MCP server. An agent can browse and hire from Claude or Cursor.
/.well-known/agent-card.json   Our own ERC-8004 card. We are on our own board.
```

**Retired from the old project and not coming back:** `/floor`, `/offices`, `/office/[..]`,
`/house/[..]`, `/bench`(old sense), `/ledger/[..]`, `/authority`, `/assay`, `/market`,
`/settlement/[..]`, `/method`, `/proof`, `/proof/judge`, `/lineup`, `/registry`(as front door),
`/compare` (becomes a mode inside `/j/[job]`).

### 8.1 The critical path

```
/                        board, four job filters, ~40 hireable rows
  → click "Protect a loan"
/j/health                same board, filtered, ranked by lowest HF defended
  → click a row
/a/56/311259             verdict, what it did, three rails priced
  → "Hire it for this job — $0.50"
/hire/56/311259          rail chosen, exact terms, guardrails, 4 signatures declared
  → sign
/desk                    engagement live, deliverable pending, [Cancel] [Revoke]
```

Five screens. No wallet required until the fifth. No dead ends: every row that cannot be hired
still opens an agent page that explains why and offers the next best rail.

---

## 9. Design system

### 9.1 The subject, stated before designing

A live operations board for hiring autonomous workers that handle money. The audience is a person
holding assets on BSC with zero knowledge of ERC-8004. The primary job is *find the right agent
for a job and put it to work at a risk level you chose*.

The most characteristic object in this world is **the board itself** — a dense, live, sortable
list of who is available and what they have done. That is why the homepage is the board, and it is
why `flap.sh` is the right reference: it puts live inventory on the first screen with no marketing
in front of it.

### 9.2 Direction: "The Board"

A physical dispatch board — dark panel, illuminated type, dense rows, numbers that glow. The
memorable object is **the rail badge**, and it is the only place colour is spent.

**Rejected, deliberately, as generated-design defaults:** warm cream + high-contrast serif +
terracotta; near-black + one acid accent; broadsheet hairlines and letterpress (the old project's
look); uniform rounded SaaS cards with one radius and one grey shadow; tracked ALL-CAPS eyebrows;
`A · B · C` middle-dot meta strings; `→` glued to button text; slathering `#F0B90B` everywhere to
signal BNB-nativeness, which is the amateur tell.

### 9.3 Colour

Ground is a deep petrol ink — a genuinely coloured dark, not a tinted near-black.

```css
--ground     #0A1014   /* page. deep petrol, cool but not blue-grey */
--panel      #0F171C   /* raised surfaces, board rows */
--panel-hi   #142027   /* row hover, ~4% lift on --panel */
--rule       #1B262C   /* separators. never a 1px pure black hairline */
--text       #E8EFF2   /* primary */
--muted      #7E9099   /* secondary, meta, units */
--dim        #4A5A63   /* not-measured, disabled, absent */
```

**The rail ramp is the entire chromatic system.** Three colours, encoding escalating exposure —
derived from the product's risk model, not chosen for decoration:

```css
--rail-call     #5FD4C4   /* teal.  give nothing.        read-only, safe   */
--rail-hire     #F0B90B   /* gold.  give an escrow.      money committed   */
--rail-mandate  #FF7A45   /* ember. give authority.      handle with care  */
```

`--rail-hire` is BNB's own gold, used **once per row at 12px**, on the state that means "money is
committed". That is the only relationship to their brand, and it is earned rather than decorative.

Two signals, used almost never:

```css
--refused    #6B7A82   /* a refusal is absence of light, never red */
--error      #C2453C   /* appears at most once per view */
```

**Rule on absence:** unmeasured renders as `--dim` with the word `not measured`. It never renders
as `0`, never as a blank, never as a grey bar. "No reviews" and "couldn't read reviews" are
different strings and both appear.

### 9.4 Type

Two families, clearly distinct, zero licence cost, self-hosted with no third-party request.

| Role | Face | Notes |
|---|---|---|
| Interface + display | **Geist Sans** | Technical grotesque with real character and excellent tabular figures. Display is the same family at 34–44px with `-0.02em` tracking, not a decorative serif. |
| All data | **Geist Mono** | Every number, address, hash, block, percentage, duration, price. No exceptions. |

Scale (one modular scale, ~1.25): `12 / 14 / 16 / 20 / 25 / 31 / 39`.
Body 14–16px. Line length ≤ 72ch. Sentence case throughout. No tracked all-caps labels.

**The rule that carries the product:** every number is monospaced and `font-variant-numeric:
tabular-nums`. In a product about measurement, digits that jitter destroy credibility instantly.
Column widths never reflow on data refresh.

### 9.5 Layout

**Tables, not cards.** There are hundreds of hireable agents and about forty that deserve
attention. A dense board with a rail column in the leading position tells that truth structurally
before a word is read. It also looks like infrastructure rather than a storefront, which is the
correct impression for the people deciding whether to run it.

- 12-column grid, 1440px max, 24px gutters.
- Board row height **56px**. 1px `--rule` separators, never gaps.
- Radius by role, not one value everywhere: `3px` data chips, `8px` interactive, `12px` panels.
- Left-aligned throughout. Centre only the single empty-state statement.
- Sticky filter bar under the nav; sticky first column on mobile horizontal scroll.

### 9.6 Motion

One orchestrated moment, and it belongs to the thing that matters: **when a probe result
refreshes, the rail badge lights.** 220ms, ease-out, a brief bloom to full chroma then settle.
Nothing else animates on load.

| Event | Motion | Duration |
|---|---|---|
| Probe refresh | Rail badge blooms to full chroma, settles | 220ms |
| Value updated from chain | Single digit rolls vertically | 160ms |
| Row hover | Rule brightens `--rule` → `--muted` | 120ms |
| Hire confirmed | Row moves to `/desk` with a 8px lift | 240ms |
| Revoke | Rail badge desaturates to `--dim`, permanently | 300ms |
| Loading | Hairline pulse on the row. No spinners, no skeletons. | 900ms loop |

**Forbidden:** parallax, scroll-jacking, 3D, gradient meshes, typewriter text, counters that run
on page load without a data event, hover states that scale cards, glassmorphism, fade-and-slide-up
on every section.

`prefers-reduced-motion: reduce` → all durations 0ms, all states final. Non-negotiable.

### 9.7 Quality floor, unannounced

LCP < 1.2s. CLS 0 (tabular figures make this achievable). Homepage JS budget < 90KB gzip,
< 140KB on `/hire`. Full read path works with JavaScript off. Visible keyboard focus in
`--rail-hire`. `/` focuses board search, `⌘K` opens the palette. Contrast AA+ throughout; `--dim`
is never used for text that must be read. Mobile to 360px: board becomes stacked rows with the
rail column still aligned; four job filters stay a 2×2 grid at equal weight.

### 9.8 Copy rules

- A button says exactly what happens, and keeps its name through the flow. `Hire` → toast
  `Hired.` Never `Submit`, never `Success`.
- Empty states are direction: *"No agent is hireable for this job right now. 12 are registered
  and none answered our last probe. You can still call one for $0.01."*
- Errors name what happened and what to do. Never "Something went wrong."
- Refusals name the failed condition: *"This agent's endpoint answered but returned identical
  bytes to three different inputs. We won't sell you a hire on it."*

---

## 10. Screen-by-screen specification

### 10.1 `/` — The Board

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  BENCH          Board   Register   Data   List yours        [/] search   ⌘K   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Hire an agent to run your money on BNB Chain.                               │
│  Choose how much it can do. Watch it work. Take it back anytime.             │
│                                                                              │
│  ┌────────────────┐┌────────────────┐┌────────────────┐┌───────────────────┐ │
│  │ Keep an LP     ││ Run a grid     ││ Chase yield    ││ Protect a loan    │ │
│  │ in range       ││                ││                ││                   │ │
│  │ 14 hireable    ││ 9 hireable     ││ 11 hireable    ││ 6 hireable        │ │
│  └────────────────┘└────────────────┘└────────────────┘└───────────────────┘ │
│                                            block 120,417,873 · read 24s ago  │
├──────────────────────────────────────────────────────────────────────────────┤
│  All jobs ▾   Rail: ● Call ● Hire ● Mandate    Sort: Track record ▾          │
├────┬─────────────────────┬────────┬──────────────────────┬────────┬──────────┤
│    │ AGENT               │ RAILS  │ TRACK RECORD         │ PRICE  │          │
├────┼─────────────────────┼────────┼──────────────────────┼────────┼──────────┤
│ ◈  │ Range Keeper I      │ ▪ ▪ ▪  │ 94.2% in range · 30d │ 0.4%   │  Hire    │
│    │ bench · 337901      │        │ IL+gas −0.31%        │        │          │
├────┼─────────────────────┼────────┼──────────────────────┼────────┼──────────┤
│ ◈  │ BNB LP Rebalancer   │ ▪ ▪ ·  │ 81.7% in range · 12d │ $0.50  │  Hire    │
│    │ 0x20f1…d64b · 265375│        │ 4 recentres          │        │          │
├────┼─────────────────────┼────────┼──────────────────────┼────────┼──────────┤
│    │ Liquidation Desk    │ · · ·  │ not measured         │   —    │  Why not │
│    │ 0x8a2c…91fe · 310108│        │ identical bytes ×3   │        │          │
└────┴─────────────────────┴────────┴──────────────────────┴────────┴──────────┘
   30,015 agents declare an endpoint. 41 answered ours. → How we count
```

**Rules.** Server-rendered, 30s revalidate, every figure block-stamped. The four doors sit above
the board at equal width — Agent Diversity is settled on the front page before anyone scrolls.
Rail badges are three 8px squares; lit = available on that rail, dim = not. Unhireable rows are
**listed, not hidden**, with the specific reason and a `Why not` link. Sortable columns like a
trading board. The honesty line sits at the bottom in `--muted`, linking to `/data` — it is a
footnote, not the hero.

### 10.2 `/j/[job]` — One job's board

Identical template ×4. What changes: the headline metric column, the sort options, and the
worked example.

| Job | Headline metric | Secondary | Sort options |
|---|---|---|---|
| Keep an LP in range | % time in range, 30d | IL + gas crystallised | in-range · recentres · fee APR |
| Run a grid | Realized PnL, 30d | Fills · inventory skew | PnL · fills · drawdown |
| Chase yield | Net APY captured vs best | Switching cost payback, days | net APY · moves · payback |
| Protect a loan | Lowest HF reached | Repair latency, seconds | HF floor · latency · repairs |

Above the rows: one paragraph in plain language, and a worked example with a real mainnet
transaction. Below: `Compare` mode — select 2–3 rows, get a side-by-side on identical fields with
`not measured` shown where it is true.

**CI gate:** a test asserts all four job routes render the same component set, the same number of
metric fields, and at least one hireable row. If yield is thinner than grid, the build fails.

### 10.3 `/a/[chain]/[id]` — The agent

Verdict first in plain language, evidence one tap down, auditor detail two taps down.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Range Keeper I                                    ERC-8004 · 56:337901  ↗   │
│  Operated by BENCH · registered 2026-09-07 · block 120,417,873               │
│                                                                              │
│  Keeps a PancakeSwap V3 BNB/USDT position earning as the price moves.        │
│  It recentres the range when price leaves the band, and does nothing when     │
│  the fees would not cover the gas.                                           │
│                                                                              │
│  ┌── What it has done ──────────────────────────────────────────────────┐    │
│  │  94.2%   time in range              27.4 of 29.1 days observed       │    │
│  │  −0.31%  impermanent loss + gas     crystallised over 4 recentres    │    │
│  │  +1.84%  fees earned                vs 0.00% un-pooled hold          │    │
│  │          read at block 120,417,873 · 24s ago · method ↓              │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌── Put it to work ────────────────────────────────────────────────────┐    │
│  │  ○ Ask it once            $0.01    Current range assessment.  x402   │    │
│  │  ● Hire it for one job    $0.50    Escrowed. Paid on delivery. 8183  │    │
│  │  ○ Let it manage a range  0.4%     Scoped session. Revoke anytime.   │    │
│  │                                                     [ Continue ]     │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ▸ What it may and may not do with your money                                │
│  ▸ Every check we ran against the chain                                      │
│  ▸ Reputation — 3,000 records, 14 wallets flagged as one cohort              │
│  ▸ Reproduce every number on this page                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

For a third-party agent that fails a rail, the rail is present but disabled with the reason
inline: *"Mandate unavailable — the chain does not show this wallet using PancakeSwap V3."*

### 10.4 `/hire/[chain]/[id]` — The engagement

The screen where authority is decided. Everything that would have been a second confirmation is
on this page in English, before the button.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Hire Range Keeper I — keep an LP in range                                   │
│                                                                              │
│  How much do you want to give it?                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐                      │
│  │ Ask it once  │ │ ● Hire it    │ │ Let it manage    │                      │
│  │ $0.01        │ │ $0.50        │ │ 0.4% of gains    │                      │
│  │ Touches      │ │ Escrowed.    │ │ Standing         │                      │
│  │ nothing      │ │ No key.      │ │ permission       │                      │
│  └──────────────┘ └──────────────┘ └──────────────────┘                      │
│                                                                              │
│  MAY                                  MAY NOT                                │
│  Read your position                   Move funds to any other address        │
│  Return a written assessment          Trade, swap, or borrow                 │
│  Claim $0.50 on delivery              Claim anything without delivering      │
│                                                                              │
│  Escrow          0.50 $U into ERC-8183 job escrow                            │
│  Dispute window  900 seconds after submission                                │
│  If it fails     You reclaim the full 0.50 $U after 2026-09-08 14:22 UTC     │
│  Custody         Your wallet. We never receive your key.                     │
│  Signatures      4 (approve not required — allowance already sufficient)     │
│                                                                              │
│                                            [ Hire — 0.50 $U ]                │
└──────────────────────────────────────────────────────────────────────────────┘
```

Adopted directly from the gilbertsahumada hire-plan shape: exact-approval mode, `deadline = now +
disputeWindow + 3600`, an explicit guardrails block, and `maximumSignatures` declared **before**
the user starts so nobody is surprised by a fourth popup.

For Rail 3 the same screen renders the session scope instead: the allowlist as English clauses,
the withheld selectors and why, the daily cap, the expiry countdown, and the wrapper contract that
binds the recipient — with a link to its verified source.

### 10.5 `/desk` — Your engagements

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Your engagements                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ ▪ Range Keeper I          MANDATE · live                             │    │
│  │ Managing BNB/USDT #7271073 · in range · 4h 12m                       │    │
│  │ Last action 6m ago: recentred to [-65300, -65290]              tx ↗  │    │
│  │ May: mint, decreaseLiquidity, collect — recipient bound to you       │    │
│  │ Cap 200 USDT/day · expires in 27d 4h                                 │    │
│  │                              [ Pause ]  [ Change cap ]  [ Revoke ]   │    │
│  ├──────────────────────────────────────────────────────────────────────┤    │
│  │ ▪ Yield Router II         HIRE · awaiting delivery                   │    │
│  │ 0.50 $U escrowed · job 4821 · submits by 14:22 UTC                   │    │
│  │                                     [ View job ]  [ Reclaim at 14:22 ]│   │
│  └──────────────────────────────────────────────────────────────────────┘    │
│  A quiet tape of actions streams below. Rows, not WebGL.                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Revoke is one on-chain transaction and the badge desaturates permanently when it lands. We ship
`pnpm prove-scope` which grants a throwaway session, attacks it, revokes it, and attacks it again
— and the desk links to that output.

### 10.6 `/register`, `/data`, `/list`

**`/register`** — the full 334,770, virtualised at fixed row height, searchable by token id or
address, with rung and reason on every row. This is where the old project's homepage now lives.
It is a room, not the front door.

**`/data`** — where every number comes from. The funnel with its method and block. The
endpoint-origin concentration finding. Per-category counts. The exclusion list (dead endpoints,
duplicate origins, unparseable cards, our own agents where relevant). The open API. Every claim
carries the command that reproduces it.

**`/list`** — self-serve listing for any operator. Paste a token id, we probe it live and show
exactly what we found and which rails it qualifies for. Publishes the listing spec so an operator
can fix a failing check. Also exposed as an MCP tool so an agent can list itself.

---

## 11. The data model

### 11.1 The Measurement primitive

Taken from Docket, adopted as a type, and enforced everywhere a number is rendered.

```ts
interface Measurement {
  name: string;          // "Time in range"
  value: number;
  unit: string;          // "%" | "bps" | "seconds" | "USD"
  numerator?: number;    // 27.4
  denominator?: number;  // 29.1
  window: string;        // "30d rolling"
  observedAt: string;    // ISO
  block: bigint;         // BSC block the read was pinned to
  method: string;        // slug into /data
  source: 'chain' | 'probe' | 'registry' | 'bazaar';
}

type Maybe<T> = { known: true; value: T } | { known: false; reason: string };
```

`Maybe` is the discipline. A field is either known with a value, or unknown *with a reason*.
There is no third state, and `0` is never a stand-in for absence. The renderer refuses to display
a `Measurement` that is missing `block` or `method`.

### 11.2 The Agent record

```ts
interface Agent {
  chainId: 56 | 97;
  tokenId: string;
  registry: Address;
  owner: Address;
  agentWallet: Address;
  name: string;
  description: string;

  category: Maybe<Category>;       // classifier + evidence, never a guess
  categoryEvidence: string[];

  // supply tiers — each is a probe result, not a claim
  rails: {
    call:    RailState;   // live x402/B402 endpoint returning a parseable 402
    hire:    RailState;   // returned a signed ERC-8183 quote when asked
    mandate: RailState;   // chain shows the wallet touching this category's protocols
  };

  probe: { at: string; latencyMs: number; status: number; bodyHash: string };
  originHost: string;              // for dedup by endpoint origin
  originCohortSize: number;        // how many agents share this host

  track: Measurement[];            // category-specific, from chain
  reputation: Maybe<{ raw: number; filtered: number; flaggedWallets: number }>;

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

### 11.3 The Snapshot

Shape taken from SMEAI, extended with origin-cohort analysis.

```ts
interface Snapshot {
  generatedAt: string;
  cutoff: { block: bigint; observedAt: string };
  pipeline: { chain: 56|97; raw: number; clean: number; relevant: number }[];
  registry: { chainId: number; registered: number; declaringEndpoint: number }[];
  origins: { host: string; count: number; share: number }[];   // the 96.84% finding
  totals: {
    listed: number; callable: number; hireable: number; mandatable: number;
    probed: number; blocked: number; duplicateOrigin: number; ours: number;
  };
  perCategory: Record<Category, {
    listed: number; callable: number; hireable: number; mandatable: number; ours: number;
  }>;
}
```

`perCategory` drives the four doors directly. If any category's `hireable` is zero, the door says
so and offers the callable count instead — never an empty door.

---

## 12. Supply: how the board fills

Four sources, in descending order of value, all merged into one `Agent` record and deduplicated
by `(chainId, tokenId)` then clustered by `originHost`.

### 12.1 ERC-8004 registry — the base layer

Read `0x8004a169fb4a3325136eb29fa0ceb6d2e539a432` directly (`ownerOf`, `tokenURI`) and via
8004scan for indexed detail. Resumable cursor in Postgres. The goal is a **complete** sweep, as
gilbertsahumada achieved — a partial sweep is a partial marketplace.

### 12.2 B402 Bazaar — free real usage data, unused by the entire field

Binance's own discovery layer for paid endpoints. Opt-in, free, no registration, indexed within
~30 seconds of the first confirmed settle carrying a metadata blob, and CDP-x402-compatible
field-for-field. It already publishes per-resource:

- `fail_rate_24h` — resources above 50% are filtered from results entirely
- `l30DaysTotalCalls`
- `l30DaysUniquePayers`

**`l30DaysUniquePayers` is the single best trust signal available on BNB Chain today** and nobody
in this hackathon used it. It is not a self-report and not a review — it is a count of distinct
wallets that paid this service in the last thirty days. It goes in the Rail 1 badge tooltip and
becomes a sort option.

We also **publish our own reference agents into B402 Bazaar**, which makes them discoverable to
every other x402 client, not just to us.

### 12.3 The prober — the listing gate

SMEAI's double-probe, hardened:

1. Fetch the agent card from `tokenURI`. Parse it. Record failure reasons verbatim.
2. Call the declared endpoint. Record status, latency, body hash.
3. **Send three different inputs.** If the body hash is identical across all three, mark
   `identical-bytes` and refuse to sell any rail on it. (AiKi found agent 310108 doing exactly
   this; a single 200 reads it as healthy.)
4. For Rail 2, request an actual ERC-8183 quote. A signed quote back is the only proof of
   hireability.
5. For Rail 3, scan the wallet's on-chain history for the category's protocol events — with the
   two bugs the old project already found and fixed: routers emit no logs of their own (look for
   the pool's `Swap` naming the wallet as recipient), and trailing `null`s in a topic filter
   silently return nothing.

Probes run every 15 minutes, checkpointed and resumable, results written with `observedAt`. A
result nobody refreshed inside the window decays to unavailable, which fails in the safe
direction.

### 12.4 Origin-cohort deduplication

Cluster by endpoint host. Where one host serves ≥100 agents, the board shows **one row per
distinct service**, with `+29,066 more from this operator` as an expandable, and the cohort size
on the row. Ranking never lets a batch registration dominate a board.

This is the direct product consequence of the 96.84% finding, and it is what makes a board of
334,770 agents usable instead of unusable.

---

## 13. Our own agents

Eight, two per category, all on BSC mainnet, all running own-capital demonstration loops.

They exist for three reasons: to guarantee every category board has depth on judging day, to give
TermiX something worth hiring, and to prove the rails work end to end. They are **reference
implementations against a published listing spec**, not the product.

| Category | Agent I (primary) | Agent II (conservative) | Venue | Proof it produces |
|---|---|---|---|---|
| Rebalancing | **Range Keeper I** — recentres a V3 range on drift | **Range Keeper II** — wider band, fewer recentres | PancakeSwap V3 | % time in range; IL + gas crystallised per recentre; fees vs un-pooled hold |
| Grid | **Grid Runner I** — capped grid in a band | **Grid Runner II** — trend and loss breakers | PancakeSwap V3 | realized PnL; fills; inventory skew; zero-price stress |
| Yield | **Yield Router I** — rotates on best net rate | **Yield Router II** — high hysteresis | Venus / Aave | net APY captured vs best available; switching cost payback in days |
| Health | **Health Shield I** — repays to defend a floor | **Health Shield II** — supplies collateral instead | Venus | lowest HF reached; repair latency in seconds; tx-backed drills |

**The agent contract.** Ported from the old project because the shape is genuinely right:

```ts
interface Strategy {
  id: Category;
  name: string;
  describe(): string;
  evaluate(ctx: AgentContext): Promise<Decision>;   // reads state, proposes calls, sends nothing
}
```

Dry-runnable, every action carries the observation that produced it, and the calls it emits are
exactly what the session allowlists — so a strategy that tries to act outside its brief fails at
the wallet rather than being trusted not to.

**All eight serve all three rails:**

- Rail 1: a paid `GET /status` over x402 in USD1, ~$0.01. (USD1 because neither BSC USDT nor USDC
  implements EIP-3009, verified by checking `authorizationState` and `DOMAIN_SEPARATOR` — a
  finding worth carrying forward.)
- Rail 2: an ERC-8183 seller endpoint returning a signed quote, submitting a canonical manifest,
  and serving `result.manifestText` byte-for-byte at the deliverable URL.
- Rail 3: a scoped Altana session, with `RecipientBound` under any Pancake call.

**Two rules that stop them becoming a boutique:**

1. **Ranking never privileges them.** If a third-party agent measures better on a category's
   headline metric, it ranks above ours. This is enforced in the ranking function, unit-tested,
   and stated on `/data`.
2. **`/list` is self-serve and the spec is public.** Anything we did to make our agents listable,
   any operator can do. There is an MCP tool so an agent can list itself.

**A stretch goal worth attempting:** get two or three *other hackathon teams* to list on BENCH.
Agripinaa's eight, VEYRA's four, studio-desk's four. If a judge sees another entrant's agent
hireable on our board, the marketplace claim proves itself in a way no amount of code can.


---

## 14. Technical architecture

### 14.1 Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 App Router, React 19, RSC-first | SSR everything a judge reads; wallet only for writes |
| Styling | Tailwind v4 + the token set in §9 as CSS vars | No runtime, tiny, tokens enforce the system |
| Chain | viem | Already proven across the old codebase |
| Sessions | `@altananetwork/sdk` | Rail 3, and the Altana track's literal spec |
| Commerce | `@altananetwork/sdk` ERC-8183 helpers | Rail 2 buyer **and** seller sides |
| Payments | x402 / B402, USD1 + $U | Rail 1 and 8183 budgets |
| Store | Postgres + Drizzle | Probe and index cache, keyed `(chainId, tokenId)` |
| Worker | Node on Railway | Indexer, prober, quote-checker, metric collector |
| Contracts | Solidity 0.8.28 + Foundry | `RecipientBound` only. No market contracts. |
| Tests | Vitest + Foundry | Plus the CI gates in §14.4 |

### 14.2 Services

```
┌──────────────────────────── BENCH web (Next 15, RSC) ─────────────────────────┐
│  /  /j/[job]  /a/[chain]/[id]  /hire/[chain]/[id]  /desk                      │
│  /register  /data  /list        /api/v1/*  /api/mcp  /.well-known/*           │
└───────────────┬───────────────────────────────────────────┬───────────────────┘
                │ reads (cached, block-stamped)             │ writes (user wallet)
┌───────────────▼───────────────────────────┐   ┌───────────▼───────────────────┐
│  WORKER                                    │   │  RAILS                        │
│   indexer   ERC-8004 sweep, resumable      │   │   1  x402 / B402 client       │
│   prober    card → call → 3-input identity │   │   2  ERC-8183 hire plan       │
│   quoter    ERC-8183 quote request         │   │   3  Altana session + wrapper │
│   metrics   per-category chain reads       │   └───────────────────────────────┘
│   bazaar    B402 ingest (calls, payers)    │
│   origins   cohort clustering              │
└───────────────┬────────────────────────────┘
                │
        ┌───────▼────────┐         BNB Smart Chain (56)
        │   Postgres     │         ERC-8004 registry · ERC-8183 commerce
        │  (chainId,     │         Altana Keystore · PancakeSwap V3 · Venus
        │   tokenId)     │         x402 / B402 facilitators
        └────────────────┘
```

### 14.3 The one contract we deploy

`RecipientBound.sol` — ported, unchanged in substance, from the old project. It is the answer to
the wall in §6.1 and it is the single best idea that project produced.

A session key grants a target and four selector bytes; it cannot bind an argument. PancakeSwap's
position manager takes `recipient` as an argument on `mint` and `collect`. So the session is not
granted on the position manager at all — it is granted on `RecipientBound`, whose `mint` and
`collect` **have no recipient parameter**. The destination is written from immutable storage.

Four functions. No `multicall`, no `sweepToken`, no `refundETH`, no `unwrapWETH9`, no upgrade
path, no owner. What is not written cannot be called, and a selector added to PancakeSwap tomorrow
does not silently widen a grant signed today.

Nothing else is deployed. No market, no bond, no assay contract, no ledger.

### 14.4 CI gates that enforce the plan

These exist specifically to prevent the drift that killed the last build.

| Gate | Fails the build when |
|---|---|
| `diversity` | Any of the four job routes has fewer metric fields, fewer components, or zero hireable rows relative to the others |
| `measurement` | Any rendered number lacks `block` or `method` |
| `absence` | Any `Maybe` unknown renders as `0` or empty string |
| `network` | Chain 56 and 97 figures appear in the same aggregate |
| `budget` | Homepage JS > 90KB gzip, `/hire` > 140KB, LCP > 1.2s |
| `routes` | Any link in any README or page 404s against the deployed site |
| `ranking` | A first-party agent outranks a better-measured third-party agent on any board |
| `smoke` | Every route, the funnel freshness, the three rails, checked against production every 15 minutes |

The `routes` and `ranking` gates are the two that matter most. The last build shipped a README
documenting four 404s; and the whole failure mode of this category is a marketplace that
quietly favours its own supply.

---

## 15. What we port, what we delete

### 15.1 Ported — roughly 6–7k lines, imported as a labelled vendor drop

Not as heritage. As a dependency with a clear provenance note.

| From `mandate-bnb` | Lines | Why it survives |
|---|---|---|
| `chain/valuation/*` — V3 tickmath, Venus supply **and** borrow, MasterChef, native, ERC-20 | ~900 | Genuinely rare. Makes "how has it performed" real. Refuses rather than approximates: if any adapter returns null, the whole valuation is null. |
| `contracts/src/RecipientBound.sol` + tests | ~750 | The recipient-binding wrapper. §14.3. |
| `chain/scope.ts` — session scoping, Porto wildcard-sentinel guard | ~250 | Blocks `0x3232…` sentinels that silently convert a scoped grant into an unrestricted one. |
| `x402/*` — buyer, seller, USD1/EIP-3009 finding | ~250 | Rail 1. |
| `sources/bsc.ts`, `probe.ts`, worker indexer | ~600 | Resumable sweep, event probes, the trailing-null topic-filter fix. |
| `sybil/detect.ts` | ~275 | Reputation is worthless unfiltered; this is one tap down on the agent page. |
| `agents/types.ts` + four strategies | ~800 | The `Strategy` shape in §13. |
| `assay/classify.ts` | ~200 | Category classification with evidence. Repurposed; the fineness scoring is dropped. |

### 15.2 Deleted, and this list is binding

`MandateMarket.sol`, `MandateMarketV2.sol`, `AssayBond.sol`, `Underwriter.sol`,
`ShadowLedger.sol` and every test around them. The adjudicator, epochs, proposals, challenges,
bonds, slashing, dismissal, succession queues. Millesimal fineness, hallmarks, the assay office,
rungs, the ladder-as-navigation, the register-as-homepage, date letters, sponsor marks,
defacement. The WebGL floor and its shaders. Greenfield attestations. `mandate-verify` as a
headline feature. The "self-reported claims are worthless" thesis as the hero message. Both
competing design systems.

Some of that is the best work in the hackathon. It is not this product. If any of it returns, it
returns after adoption, as chapter two.

### 15.3 What changes about how we work

| Old habit | New rule |
|---|---|
| Build the mechanism, then the UI | Build the journey, then whatever mechanism it needs |
| Our four agents first, third-party hire last | Third-party hire first (P2). Our agents come after. |
| Honesty as the product's personality | Honesty in the data model. The product's personality is *usefulness*. |
| Documentation as argument | Documentation as reference. If a link 404s, CI fails. |
| Nine markdown files at repo root | One README, one `/data` page. That is the documentation. |

---

## 16. Partner tracks, designed in

Not bolted on. Each track is a consequence of the architecture.

### 16.1 Altana — 50,000 XP

Rail 3 *is* the Altana specification. Their qualification list, mapped one-to-one:

| Their requirement | Where it lives |
|---|---|
| Agents on their own Altana wallets | All eight reference agents; created via `createWallet`, passkey path via `createPasskeyWallet` |
| Sessions with call allowlist, spend cap, expiry | `grantSession` on `/hire`, rendered as English clauses before signing |
| Sessions registered in Keystore | Registered by default; `/desk` reads validity live from the Keystore registry |
| Real on-chain transactions through a session key | Mainnet. Every reference agent's actions go through its session. |
| User-facing control and revoke inside the product | `/desk` → `Revoke`, one transaction, badge desaturates permanently |
| **Bonus:** hire Agent Studio agents through ERC-8183 | Rail 2, `hireErc8183Agent` — this is the core of the product |
| **Bonus:** sell over x402/B402 | Rail 1 seller side on all eight agents, plus B402 Bazaar listing |

We also ship `pnpm prove-scope` (VEYRA's pattern): grant → in-scope succeeds → out-of-scope
refused → revoke → identical call now fails. Six assertions on mainnet, output linked from `/desk`.

Altana's **Skills Registry** gives us fork-tested protocol know-how free — the PancakeSwap trading
skill's quirks table (USDT has 18 decimals on BNB Chain, quote both the direct pair and the WBNB
hop, approve before each direction) goes straight into the reference agents.

### 16.2 TermiX — $10,000

They will hire from the marketplace themselves, with no instructions. Which is why P1 and P2 come
before everything else: **the test is a live transaction, not a document.**

- Rail 1 open at $0.01 — the cheapest possible way for them to transact. (Docket's paid path was
  "closed at admission", so TermiX literally could not hire from it.)
- Rail 2 open with signed quotes and hash-verified deliverables.
- `Find, compare, hire, without instructions` is 20% of their score and is literally our IA.

**Agent Advantage Report**, generated from real runs, following AiKi's shape — a runnable script
making live calls, outputs saved whole, nothing estimated:

| # | Category | Task | No-agent arm |
|---|---|---|---|
| 1 | Security | Which of 20 registry agents are safe to hire? | The agent card, believed — what the directory actually offers |
| 2 | Trading | Recentre a V3 position at the anchor block | Doing nothing — the un-pooled hold |
| 3 | Health | Repair a Venus position before liquidation | The liquidation penalty Venus publishes and charges |
| 4 | Yield | Move stables to the best net venue | The definitional absence of the rotation |

At least one from trading/stock/security ✓ (two). Time, cost and output quality for each, actual
outputs attached, method fixed before results exist.

### 16.3 PancakeSwap — 1,000 CAKE

Range Keeper and Grid Runner operate on PancakeSwap V3 with real capital, and the custody boundary
is a *binding* rather than an isolation assumption — `RecipientBound` means the hired agent has no
recipient argument to abuse. That is a materially stronger claim than anything else in the field,
including from the team that minted first.

Deliverables: one real recentred position with in-range checks logged; the honest half published
too (on windows where holding beat recentring, we say so); and a pool-demand research endpoint
sold over x402, which answers the "research that spots demand where new pools could improve
liquidity efficiency" line in their brief.

---

## 17. Build order

Deliberately inverted from the last project, which built its own agents first and third-party hire
last — which is exactly how you become a boutique.

Sequenced by dependency, not by calendar. Each phase is independently demoable and each has a
hard exit criterion.

### P0 — The spine

Scaffold the new repo. Route tree, token system, `Measurement` and `Maybe` types, the board
component, the four job filters. Indexer sweeps the ERC-8004 registry to completion. Prober does
card-fetch and endpoint-call. Homepage renders real rows from real data.

**Exit:** a stranger lands on `/`, sees four jobs with live counts, clicks one, sees real agents
ranked with real freshness stamps, and opens an agent page that explains what it does. No hire yet.
JS under 90KB, LCP under 1.2s, reads with JavaScript off.

### P1 — Rail 1 (Call)

x402/B402 client. Pay-per-call against **third-party** agents. B402 Bazaar ingested as a supply
source with `l30DaysUniquePayers` on the badge. Our eight agents expose paid `/status`.

**Exit:** **a stranger pays $0.01 and gets an answer from an agent we do not operate.** No
authority granted, no wallet risk. This is the cheapest possible first real transaction and it
proves the marketplace is not a directory.

### P2 — Rail 2 (Hire) — the gate

ERC-8183 hire plan (validate quote → allowlist + expiry → buyer facts → 5 typed intents → exact
approval → fund). Quote requester in the worker. Deliverable fetch with `keccak256` verification
against the on-chain commitment. Dispute window, settle, reclaim-after-expiry.

**Exit:** **a stranger hires an agent we do not operate, the deliverable verifies against its
on-chain hash, and the escrow settles.**

This is the single artifact that wins the brief. Nothing else ships until it works — not the eight
agents, not the metrics, not the design polish. If P2 is not done, the project is not a
marketplace and no amount of the rest compensates.

### P3 — Rail 3 (Mandate) + our eight

Passkey Altana account. Scoped session with allowlist, cap, expiry, Keystore-registered.
`RecipientBound` deployed and verified, used under every Pancake call. Revoke in `/desk`.
`prove-scope` script green on mainnet. Then the eight reference agents, two per category, funded
with small own capital, running their loops.

**Exit:** grant → agent acts → revoke → identical call refused, all on mainnet, from the product,
with the transactions linked. Every category board has at least one first-party agent with a real
track record.

### P4 — Depth

Category-specific metrics computed from chain (in-range %, IL+gas, realized PnL, net APY vs best,
HF floor and repair latency). Origin-cohort dedup shipped. `/register` virtualised. `/data` with
the funnel, the origin concentration finding, and the methods. Public API, MCP server, `/list`
self-serve. Compare mode. Agent Advantage Report generated from real runs.

**Exit:** a user can make a genuinely informed hiring decision from a board row alone. All four
categories pass the `diversity` CI gate.

### P5 — Usage

This is judging Phase 2 and probably the real tiebreak. Instrumentation, an honest public usage
counter, uptime monitoring every 15 minutes, and outreach: other operators listing, other teams'
agents on the board, TermiX able to hire cold.

**Exit:** distinct non-team wallets have transacted on all three rails, and the number on `/data`
is real.

### P6 — Polish

The single motion moment. Full a11y audit. Mobile to 360px. Screenshot review of every screen
against §9. Copy pass end to end. Chanel rule: remove one thing from every screen.

---

## 18. The judge journey

Four minutes, no narration, phone in hand. If this film exists and every step works on the
deployed site, the main-track rubric is a formality.

| Time | What happens | What it proves |
|---|---|---|
| 0:00 | Open BENCH. Four jobs, live counts, a board of real agents. No wallet prompt. | Functionality — land |
| 0:20 | Tap **Protect a loan**. Board filters. Rows ranked by lowest HF defended, each with freshness. | Diversity + find by category |
| 0:40 | Open a row we do not operate. Read the plain verdict, the metrics, the three prices. | Data Quality + understand |
| 1:05 | Tap **Ask it once — $0.01**. Pay. An answer comes back. | Rail 1, zero authority |
| 1:30 | Back. Tap **Hire it — $0.50**. Read may / may-not, escrow, dispute window, reclaim date, 4 signatures. Sign. | Rail 2 — hiring a stranger's agent |
| 2:10 | `/desk`: job funded, awaiting delivery. Deliverable arrives, hash verifies green. | Activate, end to end |
| 2:30 | Open a first-party agent. Tap **Let it manage a range**. Passkey, scope, one confirm. | Rail 3, minimal friction |
| 2:50 | `/desk`: live, last action 6m ago with tx. Tap **Revoke**. Badge dies. | User-facing control (Altana) |
| 3:10 | `/register`: search `269703` — another team's agent. It resolves, with honest state. | It is the front door for *every* agent |
| 3:30 | `/data`: the funnel, and 96.84% of declared endpoints on one host, with the method. | Data Quality, at chain scale |
| 3:50 | Stop. | |

Two silent films: the 90-second journey above, and a 60-second cut of hiring a third-party agent
end to end.

---

## 19. Anti-drift rules

Five rules. They are the whole reason this rebuild will not repeat the last one.

1. **No feature ships unless it sits on the path `land → find → understand → hire`.**
   Everything else goes to `/data` or the API. If you cannot name which step of the path a piece
   of work serves, it does not get built.

2. **P2 is the gate.** Until a stranger can hire an agent we do not operate and the escrow
   settles, nothing else gets built. Not the eight agents. Not the metrics. Not the design pass.

3. **Weekly stranger test.** Hand the URL to someone who has never heard of ERC-8004 and watch
   them try to hire something. Where they stall is the only bug that matters that week. Write it
   down. Fix it before anything else.

4. **Our agents never outrank a better third-party agent.** Enforced in the ranking function,
   unit-tested, stated publicly on `/data`.

5. **If it is impressive but a judge would not touch it, it is not product.** The last repo failed
   this test roughly twenty times — 5,446 lines of settlement Solidity, a hand-written WebGL
   shader, an isolated verifier package, a 700-year hallmarking system. All excellent. None of it
   on the path.

**A sixth, for the writing:** the README is a reference, not an argument. Every link in it is
checked by CI. It describes what the deployed site does today, in the present tense, and nothing
else.

---

## 20. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| No third-party agent will actually return a signed ERC-8183 quote | **High** — the funnel shows only 14 agents on all of BSC declaring `erc8183Only` and 4 declaring both | Probe for it explicitly and early in P2. If genuine third-party 8183 supply is near zero, Rail 2's third-party proof comes from **another hackathon team's agent** — reach out during P2, not at the end. Rail 1 (x402) has far more supply and is the fallback proof of third-party hiring. |
| 8004scan rate limits or degrades | Medium | Direct registry reads as the primary source, 8004scan as enrichment; bounded 4s timeout with an explicit "registry unavailable" state (wyka0's pattern); committed snapshot fallback so the site never shows a blank board. |
| Real capital on mainnet with real agents | Medium | Small positions, hard per-day caps, fail-closed sessions, `RecipientBound` under every Pancake call, `prove-scope` run before funding, and the honesty guardrail: our own agents lose their rail badges when they fail. |
| The board is empty for a category on judging day | Medium | Two first-party agents per category is the floor, and the `diversity` CI gate fails the build before it can ship. Doors never render "0" — they render the callable count and the reason. |
| Scope creep back toward the capital market | **High** — it is the team's instinct | Rule 1 and Rule 5. The deleted list in §15.2 is binding. |
| Judging Phase 2 measures usage we do not have | Medium | P5 exists specifically for this. Start outreach during P3, not after. |
| Session expiry lapses during judging | Medium — it happened last time | Expiries set well beyond the judging window, monitored by the 15-minute smoke job, and `/desk` reports a lapsed session as lapsed rather than live. |

---

## Appendix A — contract addresses

BNB Smart Chain mainnet (56) unless noted.

```
ERC-8004 Identity Registry     0x8004a169fb4a3325136eb29fa0ceb6d2e539a432
ERC-8004 Reputation Registry   0x8004baa17c55a88189ae136b182e5fda19de9b63

PancakeSwap V3 PositionManager 0x46A15B0b27311cedF172AB29E4f4766fbE7F4364
PancakeSwap V3 SwapRouter      0x13f4EA83D0bd40E75C8222255bc855a974568Dd4
PancakeSwap V2 Router          0x10ED43C718714eb63d5aA57B78B54704E256024E

WBNB                           0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
USDT (BSC-USD, 18 decimals)    0x55d398326f99059fF775485246999027B3197955
USD1 (EIP-3009 capable)        0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d

Venus Comptroller              0xfD36E2c2a6789Db23113685031d7F16329158384

Altana ERC-8183 kernel, EvaluatorRouter, OptimisticPolicy, $U:
                               ERC8183_ADDRESSES from @altananetwork/sdk (56 and 97)
$U testnet faucet (chain 97)   0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3
                               requestTokens() — 10 $U, once per address per 30 min
```

**Quirks that break naive integrations** (from the Altana Skills Registry and our own probes):

- USDT on BNB Chain has **18 decimals**, not 6. `$20` is `20n * 10n ** 18n`.
- PancakeSwap routers emit **no events of their own** — the `Swap` comes from the pool. A
  capability scan that looks for logs emitted *by* the router finds nothing, forever.
- Trailing `null`s in an `eth_getLogs` topic filter silently return zero results. `[sig, null,
  wallet]` works; `[sig, null, wallet, null]` returns nothing and does not error.
- Neither BSC USDT nor BSC USDC implements EIP-3009 (no `authorizationState`, no
  `DOMAIN_SEPARATOR`). x402's `exact` scheme needs USD1 or $U.
- Route selection: quote the direct pair **and** the WBNB hop, use whichever is better.

---

## Appendix B — public API

Open, unauthenticated, CORS-open, rate-limited. Documented at `/data`. A typed client on npm.

```
GET  /api/v1/agents?job=&rail=&chain=&sort=&limit=&offset=
       The board. Every row carries rails, track record, freshness, and refusal reasons.

GET  /api/v1/agents/:chainId/:tokenId
       One agent, full record including every probe result and its reason.

GET  /api/v1/snapshot
       The funnel: pipeline, registry totals, origin cohorts, per-category counts.

GET  /api/v1/jobs/:job
       Category metadata, metric definitions, and the ranked board for one job.

POST /api/v1/quote/:chainId/:tokenId
       Request an ERC-8183 quote. Returns the signed envelope or the refusal reason.

POST /api/v1/hire/plan
       The hire plan: transaction intents, guardrails, signature count. Signs nothing.

GET  /api/v1/methods/:slug
       How a number is computed, with the command that reproduces it.
```

Plus `/api/mcp` exposing `find_agents`, `read_agent`, `request_quote`, `plan_hire`,
`list_agent` — so an agent can browse and hire from Claude Code or Cursor. Actions that move
value return the transaction for the caller to sign, with `executed: false` in the payload rather
than only in the description.

**This is an open invitation to the rest of the field.** Any directory, router or wallet on BSC
can use it. A measurement nobody else can obtain is indistinguishable from one nobody else can
falsify.

---

## Appendix C — repository layout

```
bench/
├── apps/
│   ├── web/                 Next 15, RSC-first. The eight routes.
│   │   ├── app/
│   │   │   ├── page.tsx              the board
│   │   │   ├── j/[job]/              four job boards, one template
│   │   │   ├── a/[chain]/[id]/       agent
│   │   │   ├── hire/[chain]/[id]/    the engagement
│   │   │   ├── desk/                 live engagements
│   │   │   ├── register/             the full 334k
│   │   │   ├── data/                 methods, funnel, API docs
│   │   │   ├── list/                 self-serve listing
│   │   │   └── api/{v1,mcp}/
│   │   └── components/board/  Board, Row, RailBadge, JobDoor, Measurement,
│   │                          Verdict, ScopeCard, HirePlan, Tape
│   └── agents/              Eight reference agents: chassis, strategies,
│                            x402 server, 8183 seller, runner
├── packages/
│   ├── rails/               call (x402/b402) · hire (8183) · mandate (altana)
│   ├── index/               ERC-8004 sweep, 8004scan, B402 Bazaar, origin cohorts
│   ├── probe/               card fetch, 3-input identity check, quote request
│   ├── metrics/             per-category chain reads, surplus math, valuation
│   ├── measure/             Measurement + Maybe types, renderers, guards
│   └── shared/              chains, ABIs, tokens, addresses, SSRF guard
├── contracts/               RecipientBound.sol + tests. Nothing else.
├── worker/                  indexer · prober · quoter · metrics · bazaar · origins
└── README.md                One file. Present tense. Every link CI-checked.
```

---

## The sentence BNB Chain should be able to say

> *"We asked for one venue where someone can find an agent and hire it. BENCH is that venue. It
> reads the whole registry, tells you honestly which agents are actually reachable, and lets you
> put any of them to work at a level of authority you choose — a cent for an answer, an escrow for
> a job, or a capped session for a position you can revoke in a tap. It works for agents we
> didn't build, from a wallet we don't hold. That is the front door."*

If that sentence is true on the deployed site, this wins. Everything in this document exists to
make it true, and nothing that does not serve it belongs in the repository.