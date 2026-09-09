# MANDATE — Full Rebuild Plan

*The assay office was right. The front door was wrong. This rebuild keeps the moat and replaces the door.*

Owner: iamdflame · Chain: BNB Smart Chain (56) · Status: greenfield rebuild, no deadline constraint

---

## 0. The one sentence

**MANDATE becomes the marketplace where the only agents you can hire are ones that pass an independent assay — and the best-scoring agents on the board are our own, running real capital on mainnet, so the trust layer and the supply are the same thing.**

Everyone else in the field either has real agents *or* a trust story. We are the only project that can have both, because the assay engine already exists and is world-class. The rebuild's job is to make that legible to a human being in ten seconds and to put our own agents at the top of the board with earned, provable track records.

---

## 1. Honest diagnosis (grounded in the current repo)

I read the whole codebase. Here is what is true.

### 1.1 What is elite and must survive untouched (the moat)

These are in `src/lib`, `contracts/`, `src/worker`, and the public API. Do not rewrite them. They are the reason we win.

| Asset | Where | Why it's a moat |
|---|---|---|
| **Assay engine** — six tests, millesimal fineness (0–999), null-when-unmeasured | `src/lib/assay/*` | Nobody else scores agents against the chain with evidence per finding. This is the trust primitive. |
| **On-chain valuation** — V3 positions, Venus, MasterChef, tickmath, native, ERC-20 | `src/lib/chain/valuation/*` | The fixed `valueWallet()` that sees LP/lending positions, not just token balances. The thing every naive competitor gets wrong. |
| **Sybil detection** — coordinated-cohort filtering | `src/lib/sybil/detect.ts` | Turns a published 84.7 into a real 81.1. Real data-quality signal. |
| **Challengeable settlement** — staked, contradictable, block-pinned | `contracts/src/MandateMarketV2.sol` | Run end-to-end on mainnet with a real contested epoch. Strongest Altana-track story in the field. |
| **Session layer** — ERC-8183 / Altana, allowlist ∩ proven capability, cap, expiry, revoke | `src/lib/chain/session.ts`, `scope.ts` | The zero-trust activation substrate. |
| **x402 hire** — pay-per-call, permit-exact | `src/lib/x402/*`, `/api/x402/*` | A second, lighter way to hire. Live. |
| **The agent model** — `Strategy = (chain state) → allowlisted calls + reasons`, dry-runnable | `src/agents/types.ts` | Principled, inspectable, and the emitted calls *are* what the session allowlists. Beautiful. Keep the interface exactly. |
| **The worker** — indexer, probe, keeper, writeback | `src/worker/*`, `src/scripts/*` | The heartbeat that keeps data real. |
| **Public API** — `/api/v1/assay`, `/registry/funnel`, `/agents` | `src/app/api/v1/*` | Open, unauthenticated. Keep and elevate. |
| **The honesty culture** — every number carries block + age; absent ≠ zero | everywhere | This is brand equity. It is *why* the assay is believable. Carry it forward, restated for humans. |

### 1.2 What is holding us back (the target of this rebuild)

| Problem | Evidence in repo | Consequence for a judge / user |
|---|---|---|
| **The front door is an assay-office/ladder metaphor**, not a marketplace | `src/app/page.tsx` opens with `Funnel` + `FloorBook` (the registry funnel/ladder) | A user with zero Agent Studio knowledge lands on a *critique of the registry*, not "hire an agent to do a job." Fails the Functionality criterion's first step. |
| **The UX is expert-oriented and heavy** | `src/components/floor/FloorCanvas.tsx` + `shaders.ts` (WebGL), letterpress `mark/*` system, `Palette.tsx` command bar | Gorgeous but dense. High JS cost, steep learning curve, mobile-hostile. |
| **Design is a known "AI-generated" tell** | broadsheet look: hairline rules, monospace data labels, ALL-CAPS eyebrows, middle-dot meta strings, spaced em-dashes | Reads as templated to a trained eye. We want the opposite: unmistakably ours, unmistakably legible. |
| **Agent diversity is thin where it counts** | `src/agents/{grid,health,rebalance,yield}.ts` exist (~1,058 LOC) but only 1 agent has a settled track record (README rung 6 = 1) | Against Agripinaa's 8 mainnet agents with realized Ophis execution, our *own supply* looks like a demo, even though our *measurement* is better. |
| **The map is enormous and unfocused** | 18+ routes: `/floor`, `/offices`, `/office/[..]`, `/house/[..]`, `/bench`, `/ledger/[..]`, `/authority`, `/assay`, `/market`, `/compare`, `/evidence`... | Cognitive sprawl. No single obvious path. We need one spine and a few deep rooms. |

### 1.3 The strategic move

> Turn the assay from a lens we point at *others* into the *admission test for our own marketplace*, and make our own agents the proof that a hallmarked agent is worth hiring.

Three shifts:

1. **Front door: from "the ladder" → "the job."** The homepage asks one question: *what do you want an agent to do?* Four doors: keep an LP in range, run a grid, chase yield, protect a loan. The ladder/funnel becomes one honest room you *can* visit (`/registry`), not the thing you land on.
2. **Trust: from "the whole page" → "a mark on every listing."** The hallmark + fineness stops being the homepage and becomes the badge you see on each agent, with a one-tap certificate. Legible in 2 seconds, deep on demand.
3. **Supply: from "we measure everyone" → "we also field the best-measured agents."** Ship 8 first-party agents (2 per category) on mainnet, running own-capital loops, with realized track records the assay verifies. Our board leads with our own hallmarked agents *and* lists the honest state of everyone else's.

---

## 2. Product thesis & positioning

**Name / mark:** keep **MANDATE** and the **hallmark**. They're distinctive and earned. We restyle, not rename.

**Positioning line (homepage):**
> Hire an agent to run your money on BNB Chain. Every one is assayed before you can hire it — tested against the chain, scored, and struck. The unmarked ones you can see too; we just won't pretend they're proven.

**The three-second promise:** *Pick a job → see who's proven → hire in one signature → watch them work → revoke anytime.*

**Who it's for (new default persona):** someone who holds assets on BNB Chain, wants an autonomous strategy to manage a position, and has **zero** knowledge of Agent Studio, ERC-8004, or hallmarking. They should never need to learn our vocabulary to succeed. The vocabulary is available for the people who want it.

**Why we're not comparable (the moat stack):**

```
        ┌──────────────────────────────────────────────┐
        │  MANDATE                                       │
        │  ─────────────────────────────────────────    │
        │  Real mainnet agents (like Agripinaa)   ✓      │
        │  + Independent assay / hallmark          ✓  ← nobody else
        │  + Challengeable on-chain settlement     ✓  ← nobody else
        │  + Sybil-filtered reputation             ✓  ← nobody else
        │  + Zero-friction passkey hire            ✓      │
        │  + Best-in-class human UX                ✓  ← this rebuild
        │  + Radical honesty as brand              ✓      │
        └──────────────────────────────────────────────┘
Agripinaa has row 1 + hire. Docket/PositionCrew/ProofEra have neither the assay
nor real mainnet execution together. We hold the whole stack.
```

---

## 3. Information architecture (the new map)

One spine, four job-rooms, three deep rooms, one dashboard. Everything else collapses into these.

```
/                     The job picker. Four doors + our board's headline proof. (was: the ladder)
/hire/[category]      A ranked, filterable board of agents for ONE job.
                        categories: rebalancing · grid · yield · health
/agent/[chainId]/[id] The agent page. Plain-language verdict on top; certificate + evidence below.
/activate/[id]        The zero-friction hire flow (passkey → scope → confirm).
/dashboard           Your hired agents: live status, what they did, permissions, one-tap revoke.

  deep rooms (linked, not landed on):
/registry            The honest ladder. 303k registered → 5 answered → 1 settled. The old front door, kept as a room.
/settlement/[id]     A mandate's settlement tape: proposed, challenged, resolved, block-pinned.
/method              How the assay works, what a rung costs, how to reproduce every number. (was /evidence + /assay)

  developer surface (unchanged, elevated):
/api                 The open, unauthenticated assay API + typed client.
/.well-known/*       Agent cards. MCP endpoint.
```

**Retired or merged:** `/floor` (WebGL) → an optional lightweight "live tape" widget inside `/dashboard` and `/registry`; `/offices`, `/office/[..]`, `/house/[..]` → folded into agent pages as provenance; `/bench`, `/compare` → compare becomes a mode inside `/hire/[category]`; `/authority` → merged into `/dashboard`; `/market` → replaced by `/hire/[category]`.

**The critical path (what a judge/user does, no dead ends):**

```
Land on /  →  "Protect a loan"  →  /hire/health
   →  board ranked by proven track record, our agents hallmarked at top
   →  click an agent  →  /agent/56/<id>
   →  read: "Passed. Fineness 812. Repaid a loan from HF 1.25→1.60 in 62s. Here's the tx."
   →  "Hire"  →  /activate/<id>
   →  create passkey (no seed)  →  fund gas once  →  set a cap + expiry  →  confirm
   →  /dashboard: agent is live, shows first action, one button says "Revoke"
```

Every step is a real screen with a real next action. No "coming soon," no empty state without a way forward.

---

## 4. Frontend rebuild

This is the headline. We break the entire frontend and rebuild it lighter, faster, human-first, and unmistakably ours.

### 4.1 Art direction: "The Instrument"

The subject is **measurement of precious things** (assaying metal) applied to **autonomous agents that handle money**. The wrong move is antique/letterpress (what we have) or crypto-gold-on-black (the cliché next door). The right move is the feeling of a **precision instrument**: calm, exact, high-signal, trustworthy, a little clinical — a caliper, a spectrometer, an assay balance — rendered for humans, not machines.

**We deliberately reject** (these are the generated-design tells, and our current site uses several):
- warm cream + high-contrast serif + terracotta accent
- near-black + one acid accent
- broadsheet hairlines / letterpress / dense newspaper columns ← *our current look*
- identical rounded SaaS cards with one radius and one grey shadow
- ALL-CAPS tracked eyebrows, `A · B · C` middle-dot meta, `WORD — fragment` labels, monospace for every data label, `→` glued to buttons

**Compact token system (proposal — swappable, we iterate against screenshots):**

*Color — "pewter & touchstone," light and cool, one restrained metal accent:*
```
--paper      #F7F8FA   base surface (cool near-white, not cream)
--pewter     #DfE3E8   panels, the metal being assayed
--graphite   #3A4149   secondary text, borders (never pure hairlines)
--touchstone #12151A   ink / primary text / the strike (near-black with cool cast)
--assay      #2B6CF6   the one interactive/live accent (a cool "instrument" blue)
--struck     #9A7B3F   reserved ONLY for a passed hallmark + fineness ≥375 (real brass, used once per view)
--fail       #B23A3A   inconclusive/fail states, used sparingly
```
Base is light and airy (user-first, legible). The brass `--struck` is the single bold moment — a hallmark that actually looks precious — and appears at most once per viewport. Everything else is quiet.

*Type — reject the serif-display cliché; numerals are the star (fineness, alpha, bps):*
- **One workhorse sans** with real character and excellent tabular numerals for ~95% of the UI. Candidates: *Söhne*, *ABC Diatype*, *Aeonik*, or the free *Geist Sans* / *Inter Tight* if we stay zero-license. Not default Inter.
- **A distinctive numeric treatment** for the fineness readout and the mark — large, tabular, confident. Consider a face with a strong "instrument" numeral (e.g., *Geist Mono* used *only* for the fineness dial and settlement figures, not for every label). The number 812 should feel engraved, not printed.
- Type scale (Elements of Typographic Style, one modular scale ~1.25): `12 / 15 / 19 / 24 / 30 / 38 / 48`. Body 15–16px, line length ≤ 72ch. Sentence case everywhere. No tracked all-caps.

*Layout — a calibrated grid, not a broadsheet:*
- 12-col fluid grid, generous gutters, strong left alignment for reading, centered only for the single hero statement.
- Cards exist but are **differentiated by hierarchy**, not uniform: the agent tile carries the mark and one hero number; secondary panels are flatter and quieter. Radius is small and *consistent by role* (e.g., 10px interactive, 4px data chips), not one radius on everything.
- Borders are `--graphite` at low opacity or subtle fills, never 1px hairline rules everywhere.

*Principles:*
1. **One number leads every surface.** Fineness on the mark, alpha on the agent, HF on the health board. Big, tabular, honest.
2. **Spend boldness on the hallmark.** It is the memorable object. Everything else is disciplined and calm.
3. **Evidence is one tap away, never in your face.** Verdict first; the six tests, the tx hashes, the reproduce-command live under a disclosure.
4. **Absence is designed.** "No reviews" and "couldn't fetch reviews" are different, visible, and never rendered as a zero or a blank.

### 4.2 The hero (homepage) — the most important screen

The default hero (a big number + gradient) is banned by our own principles unless it's truly best. Here the most characteristic object in this world is **the act of assaying a job**. So the hero is a **live job picker with a working hallmark**, not a marketing splash.

```
┌────────────────────────────────────────────────────────────────────┐
│  MANDATE                                    [ Registry ] [ Method ]  │  ← quiet nav, no eyebrow
│                                                                      │
│   Hire an agent to run your money on BNB Chain.                      │  ← one sentence, sans, ~38px
│   Every agent is assayed before you can hire it.                     │  ← one supporting line, graphite
│                                                                      │
│   What should it do?                                                 │
│   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────┐ │
│   │ Keep an LP    │ │ Run a grid    │ │ Chase yield   │ │ Protect │ │  ← FOUR doors, equal weight
│   │ in range      │ │               │ │               │ │ a loan  │ │     (Agent Diversity, on the door)
│   │ 3 proven      │ │ 2 proven      │ │ 3 proven      │ │ 2 prov. │ │  ← real live counts, block-stamped
│   └───────────────┘ └───────────────┘ └───────────────┘ └─────────┘ │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │  [◉ 812]  Range Keeper I  — passed, struck 3d ago             │ │  ← the ONE hallmark moment:
│   │           +13.51% alpha over hold · settled on-chain · tx ↗   │ │     brass mark, engraved 812,
│   │                                          [ See the assay ]     │ │     our own top agent as proof
│   └──────────────────────────────────────────────────────────────┘ │
│                                                                      │
│   303,391 agents are registered on BSC. 5 answered when we called.   │  ← the honesty line, small,
│   That gap is why we assay. → See the registry                       │     links to the old front door
└────────────────────────────────────────────────────────────────────┘
```

Server-rendered, figures block-stamped, no client JS required to read it. The hallmark is the single bold object. The four doors give Agent Diversity *on the front door itself* — a judge sees all four categories, equally weighted, before scrolling.

### 4.3 The category board — `/hire/[category]`

The room where hiring happens. One job, every agent for it, ranked by *proven* performance, ours hallmarked at the top, everyone else shown honestly.

```
┌────────────────────────────────────────────────────────────────────┐
│  Protect a loan                              [ Compare ] [ Filters ] │
│  Agents that defend a lending position's health factor on Venus/Aave │
│                                                                      │
│  Rank by: ● proven alpha  ○ fineness  ○ newest        block 120,148k │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ [◉ 812] Health Shield I         proven · own capital at risk  │   │  ← ours, hallmarked
│  │ Defends HF ≥ 1.5 · repaired 1.25→1.60 in 62s · 3 epochs       │   │
│  │ HF now 1.61   alpha +2.1%   slashes 0        [ View ] [ Hire ]│   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ [◉ 640] Health Shield II        proven · conservative         │   │  ← ours, 2nd variant
│  │ ...                                          [ View ] [ Hire ]│   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ [ unmarked ] @somebody/guard    endpoint answered · no record │   │  ← theirs, honest
│  │ Registered, resolvable, live. Not assayed to a fineness yet.  │   │     no fake score, no zero
│  │                                        [ View ] [ Assay it → ] │   │  ← anyone can trigger an assay
│  └──────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

Data-quality shows here as *decision-grade* rows: every figure is a real, current, block-stamped measurement with the reproduce path behind it. "Assay it →" lets a user assay any registry agent on demand — turning our engine into the board's growth loop.

### 4.4 The agent page — `/agent/[chainId]/[id]`

Verdict first (human), certificate second (proof), evidence third (auditor). Progressive depth.

```
┌────────────────────────────────────────────────────────────────────┐
│  Health Shield I                                    token 336xxx ↗   │
│                                                                      │
│  ┌─────────────┐   Passed the assay.                                │  ← plain-language verdict,
│  │   ◉ 812     │   It keeps a Venus loan above the health factor     │     no jargon required
│  │  fineness   │   you set, by repaying from a capped reserve.       │
│  │  struck 3d  │   In a live drill it caught HF falling to 1.25 and  │
│  └─────────────┘   repaired it to 1.60 in 62 seconds. [watch ↗]      │
│                                                                      │
│  Two ways to put it to work:                                         │
│  ┌────────────────────────┐   ┌────────────────────────┐            │
│  │ Hire it (a mandate)    │   │ One call over x402     │            │
│  │ It manages your loan    │   │ Ask it once, ~$0.01    │            │
│  │ inside caps you set     │   │ [ Buy one call ]       │            │
│  │ [ Hire ]                │   └────────────────────────┘            │
│  └────────────────────────┘                                         │
│                                                                      │
│  ▸ The certificate — six tests against the chain            [open]   │  ← disclosure, closed by default
│  ▸ Reputation — 3,000 records, 14 flagged as one cohort     [open]   │
│  ▸ Reproduce every number on this page                      [open]   │
└────────────────────────────────────────────────────────────────────┘
```

### 4.5 The activation flow — `/activate/[id]` (the zero-friction hire)

This is where we match and beat Agripinaa's passkey flow. Four steps, no seed phrase, every permission legible.

```
Step 1  Create a signer            → passkey (WebAuthn), no seed, ~5s. "This is your key. Only you hold it."
Step 2  Fund gas once              → single top-up, shown in $ and BNB, with why.
Step 3  Set the leash              → plain-language scope:
            "Health Shield may: repay your Venus loan, supply collateral.
             It may NOT: withdraw to any other address, trade, exceed <cap>.
             This permission expires in <30 days> and you can revoke it anytime."
            Under the hood: ERC-8183 session, call allowlist ∩ proven capability, spend cap, expiry,
            registered in Keystore so it's readable on-chain.
Step 4  Confirm                    → one passkey tap. Lands on /dashboard with the agent live.
```

Copy rule (from the design brief): the button says exactly what happens and keeps its name through the flow. "Hire" → toast "Hired." "Revoke" → "Revoked."

### 4.6 The dashboard — `/dashboard`

Your hired agents, what they've done, and the kill switch. This absorbs `/authority` and the useful half of `/floor`.

```
┌────────────────────────────────────────────────────────────────────┐
│  Your agents                                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Health Shield I   ● live   HF 1.61 (floor 1.50)               │   │
│  │ Last action 4m ago: repaid 12.3 USDT, HF 1.48→1.61 [tx ↗]     │   │
│  │ Permission: repay+supply · cap 200 USDT · expires in 27d       │   │
│  │ [ Pause ]  [ Change cap ]  [ Revoke ]                          │   │  ← revoke = one on-chain tx, instant
│  └──────────────────────────────────────────────────────────────┘   │
│  A quiet live tape of actions streams here — no WebGL, just rows.     │
└────────────────────────────────────────────────────────────────────┘
```

### 4.7 Component inventory (new, lean)

Delete the letterpress/floor kit; keep the *concepts* (mark, fineness) rebuilt as light, accessible components.

- `Hallmark` — SVG mark + fineness numeral. The one bold component. Struck/unmarked/inconclusive states. (rebuild of `mark/Hallmark` + `Fineness`, lighter, no antique geometry)
- `FinenessDial` — an instrument-style 0–999 gauge, pure SVG/CSS, the native data-viz primitive.
- `JobDoor` — the four homepage/category doors.
- `AgentRow` / `AgentCard` — board listing with mark + hero number + honest-absence handling.
- `Verdict` — plain-language pass/fail block.
- `Certificate` — the six-test disclosure (rebuild of `agents/Certificate`, collapsed by default).
- `ScopeCard` — plain-language permission editor for activation (rebuild of `ui/SessionScope`).
- `LiveTape` — lightweight action stream (replaces `floor/FloorCanvas` + `shaders`).
- `Reproduce` — copy-the-command block for any number.
- `HonestCount` — a figure that always carries block + age, and renders absence explicitly.

### 4.8 Motion & accessibility (the quality floor, unannounced)

- **One** orchestrated page-load moment: the hallmark *strikes* on the hero (a single, ~500ms, respectful reveal). No fade-up on every section, no hover-lift on every card.
- Motion that answers actions (hire confirm, revoke, assay-complete) shows *what changed* — the mark strikes, the fineness counts up, the permission chip flips to "revoked."
- `prefers-reduced-motion` fully respected. Visible keyboard focus. Full mobile down to 360px. Color contrast AA+. The whole read path works with JavaScript off (RSC/SSR).

### 4.9 Tech choices for "lighter" (concrete)

Keep Next 15 / React 19 (already there). Get light by *removing weight*, not switching frameworks.

| Lever | Now | After |
|---|---|---|
| WebGL floor + shaders | `floor/FloorCanvas.tsx`, `shaders.ts` on the client path | **Deleted.** Live tape is server-streamed rows. |
| Rendering | mix of `force-dynamic` + Suspense that shipped hidden content | **RSC-first, static+revalidate for read paths**, client islands only for activation & dashboard controls. |
| CSS | ad hoc | **Tailwind v4** (no runtime, tiny) + the token set above as CSS vars. |
| Fonts | custom `app/fonts` | **One variable sans, subset**, `font-display: swap`; the numeric face self-hosted and subset to digits + a few glyphs. |
| Charts | — | No heavy chart lib. **Hand-rolled SVG** sparklines + the FinenessDial. |
| Data | per-request chain reads on the hero | **Cache + 30s revalidate** (already the intent), served from the worker's Postgres cache, every value block-stamped. |
| JS budget | heavy | **Target < 90KB JS on the homepage**, < 140KB on activation. Route-level code splitting. |

**Performance budget (enforced in CI):** LCP < 1.5s on 4G, TBT < 150ms, CLS < 0.02, homepage JS < 90KB gzip, Lighthouse ≥ 95 across the board. A route that busts the budget fails the build.

---

## 5. Agents — "we should have our agents"

We field **8 first-party agents, 2 per category**, all on mainnet, all running own-capital demonstration loops, all producing realized track records the assay verifies. This is what turns "we measure others" into "we field the best-measured agents."

The `Strategy` interface in `src/agents/types.ts` stays exactly as is — it's excellent. We deepen the four existing strategies and add a conservative variant of each.

| Category | Agent I (aggressive/primary) | Agent II (conservative variant) | Venue | Proof it produces |
|---|---|---|---|---|
| **Rebalancing** | Range Keeper I — recenters a Pancake V3 range on drift | Range Keeper II — wider band, fewer recenters | PancakeSwap V3 | alpha vs un-pooled hold, per recenter, IL + gas crystallized and shown |
| **Grid** | Grid Runner I — capped grid in a band | Grid Runner II — trend + loss breakers | Pancake V3 / router | realized grid PnL, fills, inventory, zero-price stress |
| **Yield** | Yield Router I — rotate idle liquidity on best net rate | Yield Router II — higher hysteresis, fewer moves | Venus / Aave | net APY captured vs benchmark, switching cost paid back in N days |
| **Health** | Health Shield I — repay to defend HF floor | Health Shield II — supply-collateral preference | Venus / Aave | HF drills: fell to X, repaired to Y in Z seconds, tx-backed |

### 5.1 Execution & proof model (borrow the best idea in the field)

Agripinaa's real edge is **provable execution quality** via batch-auction settlement (surplus vs the signed limit). We adopt the same discipline so our agents' data is realized, not asserted:

- Agents that trade route through an **intent/batch-settled venue** (the repo already contemplates Ophis-style venues; keep that path) so every fill has an on-chain surplus-vs-limit we can display in bps.
- Every action carries its **observation** (already in the `Action.reason` / `Decision.observed` model) → the agent page can *explain* a trade, not just log it.
- Each agent posts a **bond** and is **settled against a benchmark committed before the outcome** (MandateMarketV2, already built) → track record becomes a balance it can lose, not a story.
- The **Agent Advantage Report** (TermiX requirement) is generated from these same runs: ≥3 tasks run both ways, time/cost/quality, ≥1 from trading/security. Scripts exist (`advantage`, `advantage:report`) — wire them to the 8 agents.

### 5.2 Deployment plan for the agents

1. Deploy/confirm the 8 wallets, each on its own Altana session-capable smart account (passkey), scoped per category.
2. Register each as an ERC-8004 agent on chain 56 with an honest card whose claims the assay can check (the repo's `register-self` / `register-house` pattern).
3. Fund small own-capital positions; start the runner loop (`src/agents/run.ts`, `scripts/keeper.ts`).
4. Let the worker probe + assay them; they appear on their own board, hallmarked by their real fineness.
5. Run the drills that produce the headline proofs (the HF 1.25→1.60 style events) and pin the tx.

**Guardrail (the honesty culture):** if an agent's endpoint stops answering, its fineness drops and the board shows it. No exemption for our own — the instrument doesn't know who it's pointed at. This is already the stated doctrine; keep it literally true.

---

## 6. Backend / engine — what carries over unchanged

Everything in §1.1. Concretely, we **do not touch**: `src/lib/assay/*`, `src/lib/chain/valuation/*`, `src/lib/sybil/*`, `src/lib/x402/*`, `contracts/*`, `src/worker/*`, `src/app/api/v1/*`, `src/agents/types.ts`. We *extend* the strategies and *rewrite* only `src/app/**` (routes/pages) and `src/components/**` (UI). The API stays the same contract so the typed client (`mandate-client`) and any external integrators keep working.

---

## 7. The trust & honesty system, restated for humans

The culture is the brand. We keep every guarantee but translate it from auditor-speak to human-speak *at the surface*, with the auditor version one tap deeper.

| Auditor version (keep, deep) | Human version (surface) |
|---|---|
| "Rung 4: fineness null when unmeasured" | "Not assayed yet" (never a fake score) |
| "3,000 feedback records, 14 wallets flag as a cohort; 84.7 → 81.1" | "Some reviews look coordinated. Real score: 81." + [why] |
| "valueWallet reads V3 + Venus + native" | "We count your LP and lending positions, not just tokens." |
| "Settlement proposed, challengeable, block-pinned" | "This track record can be disputed on-chain. Here's the tape." |
| "Endpoint silent → fineness drops" | "Offline now — score reflects it." |

---

## 8. Architecture (new)

Same engine, new head. The rewrite is the top box only.

```
┌──────────────────────────  NEW (this rebuild)  ──────────────────────────┐
│  Next 15 App Router — RSC-first, Tailwind v4, token system                │
│  /  /hire/[cat]  /agent/[chain]/[id]  /activate/[id]  /dashboard          │
│  /registry  /settlement/[id]  /method   +  light component kit            │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ reads (cached, block-stamped)          writes (passkey/session)
┌───────────────▼───────────────────────────────────────────────────────────┐
│  UNCHANGED ENGINE                                                          │
│  assay/* · chain/valuation/* · sybil/* · x402/* · sessions(ERC-8183)       │
│  worker: indexer · probe · keeper · writeback      Postgres cache          │
│  contracts: MandateMarketV2 (bond·epoch·slash·challenge)   Greenfield      │
│  8 first-party agents (Strategy = state→calls, dry-runnable)               │
└───────────────────────────────────────────────────────────────────────────┘
                │
        BNB Smart Chain (56): ERC-8004 registry · Pancake V3 · Venus · Aave · Keystore
```

---

## 9. Execution roadmap (phased, no deadline — sequenced for compounding value)

You said forget the deadline, so this is sequenced for a *real product*, with each phase shippable and demoable on its own.

**Phase 0 — Foundations (the new skeleton)**
- New route tree + layout shell; delete `/floor` WebGL, `/offices`, `/house`, `/bench`, `/market`, old `page.tsx`.
- Tailwind v4 + token system + fonts subset; establish the performance budget in CI.
- Build the design primitives: `Hallmark`, `FinenessDial`, `HonestCount`, base grid.
- *Exit:* homepage hero renders server-side, hallmark strikes, four doors, honesty line, JS < 90KB.

**Phase 1 — The critical path end to end**
- `/hire/[category]` board (all four categories) reading the real assay/registry data.
- `/agent/[chain]/[id]` with Verdict → Certificate → Evidence progressive disclosure.
- `/activate/[id]` full passkey → scope → confirm flow on ERC-8183 sessions.
- `/dashboard` with live status + one-tap revoke.
- *Exit:* a stranger can land, pick a job, hire, and revoke, on mainnet, with no dead end.

**Phase 2 — Our agents become the proof**
- Deepen 4 strategies + ship the 4 conservative variants (8 total), on mainnet, own-capital loops.
- Wire realized execution proof (surplus/bps, benchmarked settlement, HF drills) to each agent page.
- Generate the Agent Advantage Report from these runs.
- *Exit:* every category board leads with ≥1 of our hallmarked agents with a real, tx-backed track record.

**Phase 3 — Depth rooms & the growth loop**
- `/registry` (the honest ladder, rebuilt light) + "Assay it →" on-demand assay for any agent.
- `/settlement/[id]` tape; `/method` (merged evidence + how-to-reproduce).
- LiveTape widget in dashboard/registry.
- *Exit:* the assay is a public, self-serve growth loop; anyone can assay anyone and the board grows.

**Phase 4 — Polish to "unbeatable"**
- Motion pass (the single strike moment, action-response motion), full a11y audit, mobile pass.
- Lighthouse ≥ 95 everywhere; screenshot-review every screen; Chanel rule (remove one thing per screen).
- Copy pass end-to-end in the interface voice; empty/error states as direction.
- *Exit:* the product feels like a precision instrument and reads in ten seconds.

*(If you ever want a submittable cut fast, Phases 0–1 plus two mainnet agents is already a complete, judge-ready marketplace that beats the field on Functionality and ties Data Quality. But we're building the real thing.)*

---

## 10. How we beat each rival on each criterion (scorecard target)

| Criterion | The bar to clear | How the rebuild clears it |
|---|---|---|
| **Functionality** | zero-knowledge land → find → understand → activate, no dead ends | Job-first homepage, category boards, plain-language verdicts, passkey activation, dashboard revoke. The smoothest path in the field. |
| **Data Quality** | real-time, beyond counts, decision-grade | Assay (six tests) + Sybil-filtered reputation + on-chain valuation + realized execution surplus, every figure block-stamped with a reproduce command. Deepest data story, now legible. |
| **Agent Diversity** | four categories, equal depth | Four doors on the hero; 8 first-party mainnet agents (2/category) + the whole registry sorted into the same four rooms. Equal depth by construction. |
| **Eligibility** | agents live on BSC mainnet | 8 agents live on 56, own-capital loops, tx-backed. |
| **Altana bonus** | sessions with real limits, Keystore-registered, real tx, user revoke | Already built (ERC-8183 + MandateMarketV2 challengeable settlement) — now surfaced in the activation UI and dashboard. Strongest Altana story, made visible. |
| **TermiX bonus** | Agent Advantage Report, high-stakes track record | Generated from the 8 agents' real runs; trading agents report win rate, window, risk. |
| **The intangible** | "not even comparable" | We're the only entry that holds *real agents + independent assay + challengeable settlement + Sybil-filtered reputation + best UX + radical honesty* at once. |

---

## 11. Risks & mitigations

- **Scope is large.** → Phases are independently shippable; Phase 0–1 is a full product on its own.
- **Rewriting could break the engine.** → We touch only `src/app` and `src/components`; the engine, contracts, worker, and API are frozen. Typed client keeps working.
- **Real capital, real agents.** → Small positions, hard caps, fail-closed sessions, the existing fuzz/invariant tests, and the honesty guardrail (our own agents lose fineness when they fail).
- **Design drifting into cliché.** → Explicit reject-list in §4.1; screenshot review each screen; one bold element only.
- **Data freshness vs speed.** → Cache + 30s revalidate from the worker's Postgres; every number carries block + age so cached is never shown as live.

---

## 12. Immediate next steps

Say the word and I'll start building, in this order:

1. **Scaffold Phase 0**: new route tree, delete the WebGL/office/house/broadsheet kit, stand up Tailwind v4 + the token system, and build the `Hallmark` + `FinenessDial` primitives.
2. **Build the hero** (`/`) — the job picker with a live, striking hallmark, server-rendered, under budget — so you can see the new front door immediately.
3. **Build `/hire/[category]`** for one category (health) against real data, then replicate to the other three.

I can begin with #1 and #2 now and show you the new front door as a working, self-contained artifact before we wire it to the live engine.