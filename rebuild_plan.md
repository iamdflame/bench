# MANDATE — Total Teardown & Rebuild Plan

**Target: the submission BNB Chain adopts without deliberation.**
Codebase reviewed: `iamdflame/mandate-bnb` @ main, 106 files, 618-line contract, 31 Foundry tests, Next.js 15 + viem + Altana SDK.

---

# PART 0 — WHAT YOU ALREADY HAVE (so we don't destroy it)

Before the teardown, an honest inventory. You are much further along than your README communicates, and several things here are best-in-field. **Do not rewrite these:**

| Asset | Why it's strong |
|---|---|
| `MandateMarket.sol` | Solvency-fuzzed, pull-payment, challenge-windowed slashing, bounded alpha, incumbent bond lock. 31 tests. This is the best-engineered contract I saw in the entire hackathon. |
| The bond thesis | "An agent does not have a profile, it has a bond." No other team has an economic mechanism. Everyone else built probes and scores. This is your moat. |
| `RESEARCH.md` | 301,784 registered / 5 verified endpoints / 473 with feedback, plus Sybil graph and the arXiv corroboration. This is the best empirical work in the field, tied with MandateX. |
| The four strategies | `rebalance.ts` / `grid.ts` / `yield.ts` / `health.ts` emit real, structured PancakeSwap V3 and Venus calls. Not mocks. |
| The `Action`/`Decision`/`Strategy` shape | A strategy is a pure function from chain state to permitted calls with a reason attached. This is the correct abstraction and it's what makes dry-run, the tape, and the Advantage Report all fall out for free. |
| Session allowlists per-selector | You allowlist `exactInputSingle` but not `sweepToken`. That precision is exactly what Altana is judging. |
| `settlement.ts` refusing to fabricate | Returns `null` when unmeasurable instead of reporting a flat epoch. Gas included in alpha. |
| `local-sim.ts` refusing to run on chain 56/97 | You built a guard that stops a gaussian from slashing real bonds. That is real engineering conscience. |
| The floor (WebGL2, two draw calls, GLSL by hand) | Nobody else has anything close aesthetically. |

Everything below is additive or corrective. The core is sound.

---

# PART I — THE TEARDOWN: EVERY PROBLEM

## CATEGORY A — ELIGIBILITY. These are disqualifications, not weaknesses.

### A1. You have no Agent Advantage Report. You are currently ineligible for TermiX's $10,000.

TermiX's language is unambiguous: *"Submissions must include the required Agent Advantage Report to be eligible."* Not "will score higher." **Eligible.**

Searching your repo for "advantage" returns three hits: two code comments and a line in `RESEARCH.md`. There is no report. The 30% "Proven agent advantage" criterion scores against a document that does not exist, and the other 70% is never reached because you don't clear the gate.

**This is $10,000 lost to a missing markdown file.** It is the single highest-value fix in this entire document.

### A2. Your Altana sessions are not registered in KeyStore. You are failing the Altana track on a $0.50 line item.

`src/data/sessions.json`:

```json
{ "2": { "registered": false, ... } }
```

And `altana-probe.ts` says the quiet part out loud: *"registers nothing: KeyStore registration costs about $0.50 in BNB."*

Altana's requirement list, verbatim: *"**Sessions registered in Keystore**, so integration is read onchain rather than from the pitch."* They bolded it. They then said *"To be considered for the prize, your submission must show live onchain transactions in the Altana explorer."*

You built the entire session-key architecture correctly — per-selector allowlists, spend caps, expiry, revocation-as-dismissal — and then declined to spend fifty cents to make it externally verifiable. **50,000 XP forfeited to save $0.50.**

### A3. One session exists. For one category.

`sessions.json` has exactly one entry: mandate 2, `grid-trading`. Three of four required categories have no session at all.

Against the main rubric's Agent Diversity criterion — *"A submission that treats one category as the main event and the rest as an afterthought won't score well here"* — this is the literal failure mode described.

### A4. No PancakeSwap track submission.

Your `rebalance.ts` and `grid.ts` call PancakeSwap V3 SwapRouter and NonfungiblePositionManager directly. You are *already doing* the work the 1,000 CAKE track rewards. There is no README section, no narrative, no claim, and no evidence package pointing at it. Free money on the floor.

### A5. No x402 / b402 payment rail.

`grep x402` returns hits only in `scan.ts`, `schema.ts` and a UI filter — you *read* the `x402_supported` field from 8004scan. You have not *implemented* it.

BNB Chain's blog: *"with Binance x402 used as the payment facilitator in BNB Agent Studio."* Altana's bonus: *"Implement sell over x402/B402."* If you are to be adopted as the official Agent Studio marketplace, you must speak the payment protocol Agent Studio uses.

---

## CATEGORY B — THESIS CONTRADICTIONS. This is where a sharp judge kills you.

These matter more than A. A missing report costs a track. These cost the main prize, because they let a judge say *"this doesn't do the thing it says it does."*

### B1. ★ THE FATAL ONE: your benchmark lives in a local directory.

`src/lib/settlement.ts`:

```
const DIR = ".benchmarks";
const path = (mandateId) => `${DIR}/mandate-${mandateId}.json`;
```

The opening valuation — the single number that determines whether an agent earns a fee or gets slashed — is a JSON file on your laptop. It is not on-chain, not committed, not published, not reproducible.

Now read your own thesis back:

> *"An agent registry lets anyone claim anything at the price of gas. A claim that costs nothing to make is worth nothing to read."*

**The number that decides every slash in your system is exactly such a claim.** You built an entire product to punish unverifiable assertions, and the settlement input is an unverifiable assertion held by one party who also operates the market, the agents, and the adjudicator.

A judge who reads `settlement.ts` finds this in ninety seconds. And it is not a small hole — it means:

- No third party can reproduce a single one of your slashes.
- If `.benchmarks/` is lost, mandates become unsettleable.
- The `.sessions/` and `.agent-state/` directories have the same property, so the entire system is single-operator and local-filesystem-stateful.
- You cannot be adopted, because "adoption" means BNB Chain runs it, and it currently cannot run anywhere but your machine.

This is the most important finding in this document. Fix in D1/R1 below.

### B2. The market is self-dealt with dust.

Your two headline mainnet transactions are real. But trace the flow: you open the mandate, you post the bond, you operate the agent, you run the adjudicator that reports the alpha, and you claim the slash. Every role in the mechanism is one key.

And the amounts are `0.0008 → 0.0006 BNB`. That is roughly **fifty cents slashed to twenty cents.**

Your README says *"Real BNB. Real bonds. Real slashing."* A judge will read "real" and then read "0.0008" and conclude the mechanism has never been tested by an adversary. A bond that costs less than a coffee does not create the incentive your entire thesis rests on. You have proven the code path executes; you have not proven the mechanism works.

### B3. `minBond = 0.01 ether` but your live bonds are `0.0008`.

The contract sets a floor of 0.01 BNB. Your live mainnet mandates ran at 0.0008 — an order of magnitude below your own stated minimum. Either the deployed instance has a lowered `minBond`, or these went through a path that bypasses it. Either way, a judge comparing the contract source to BscScan finds an inconsistency in the parameter that makes bonds meaningful. **Check this immediately.**

### B4. Realized alpha is reported, not derived — and the adjudicator is you.

You are commendably honest about this ("the honest seam"). But honesty about a hole is not a fix, and the three bounds you cite are weaker than they read:

- *"The adjudicator can never move capital to itself"* — true, but it can slash an agent into the principal, and you are both.
- *"Slashes are escrowed through a challenge window"* — the challenge is contested to whom? There is no adjudication of the contest. It's a delay, not a check.
- *"Dismissals are contestable"* — same problem.

There is no second opinion anywhere in the system. Fix in R1.

### B5. "Why not a directory" — you are arguing with the brief.

Your README has a section explicitly rejecting the thing you were asked to build. BNB Chain asked for *"one venue to browse agents, see what they do and how they've performed, and put them to work"* and *"the measure that matters most is how easily someone can find an agent and hire it."*

You answered: a card grid can't do that honestly, so here's a capital-allocation market instead.

You are *intellectually right* and *strategically wrong*. BNB Chain wants a front door for **301,784 agents**. You are offering a bonded arena for four. The prize is *"official adoption as the canonical front door for every agent on BSC"* — you cannot be the front door for everything while rejecting the premise of a directory. See Part II for the reframe that keeps your thesis and wins the brief.

### B6. The floor is beautiful and is not a marketplace.

Functionality criterion, verbatim: *"Someone with zero Agent Studio knowledge should be able to get through it without hitting a dead end."*

Your landing page is a WebGL2 field where body radius is capital, ring is bond, tint is alpha, tremor is strikes. It is the most striking thing in the hackathon. It is also completely illegible to a first-time visitor, who does not know that tremor means strikes and will not read a legend to find out.

Do not delete it. Reposition it (see R8).

---

## CATEGORY C — RUBRIC GAPS

### C1. Classification coverage is 265 agents out of 301,784.

`agents.json`: `indexed: 3402`, `classified: 265` → rebalancing 90, grid 52, yield 71, health 52.

You correctly identified in RESEARCH.md that `categories: []` across the registry means *"classification quality is a differentiator, not a given."* You were right. You then classified 0.09% of the registry.

### C2. `agents.json` is a 1.9 MB static file.

Data Quality criterion: *"**Real-time**, accurate data that goes beyond basic counts."* A 1.9 MB snapshot committed to the repo, captured `2026-09-04T11:20:38Z`, is by definition not real-time. It will be stale on the day a judge opens it, and staler by 23 September.

### C3. No third-party agents can list themselves.

`OperatedAgents.tsx` — you operate the agents. There is no supply-side onboarding: no "register your agent" flow, no self-service assay request, no way for a stranger's agent to enter your market.

For a hackathon demo that's fine. For *"the canonical front door for every agent on BSC"* it is fatal. A front door with no way in is a wall.

### C4. Agent Diversity is structurally unequal.

Four strategies exist in code. But: one session (grid only), category classification counts vary 52–90, and there's no evidence of settled mandates across all four. The rubric explicitly punishes this.

### C5. Zero application tests, zero CI.

31 Foundry tests on the contract — excellent. `find *.test.ts` → **0**. No `.github/` directory, so no CI, no deploy checks, no uptime smoke test.

Eligibility requires *"functional and publicly accessible during judging"* — a 14-day window. You have no automated guarantee the site is up on day 12. PositionCrew has production smoke tests running in GitHub Actions. That's a visible, comparative weakness.

### C6. No agent-level performance history surface.

You have `cumulativeAlphaBps`, `strikes`, `epochsSettled` on-chain. There is no page that renders an agent's *career* — every mandate held, every epoch settled, every slash taken, every dismissal survived. That is precisely the "how has it performed" the brief asks for, and you have the data.

---

## CATEGORY D — ADOPTION BLOCKERS

Reminder of what you're actually competing for: *"Adoption means we back it as a standalone product with its own brand and team, and incubate it as the discoverability layer for agents on BSC."* Judges are asking "can we run this?"

### D1. It only runs on your machine.
`.benchmarks/`, `.sessions/`, `.agent-state/` are all local filesystem. Serverless deploys lose them. You already hit this — there's a comment in `session.ts` about production reporting "observing only" because a relative path didn't resolve on a serverless function. That bug is a symptom of the architecture.

### D2. Single trusted operator with no key ceremony.
One adjudicator key. No multisig, no rotation, no separation between adjudicator and market owner. BNB Chain cannot adopt a product where one hot key can slash user capital.

### D3. No incident/failure path.
What happens when an RPC goes down mid-settlement? When an agent's endpoint dies while holding a mandate? When a session expires with an open position? None of this is specified.

### D4. No economic sustainability model.
Who pays for gas on settlement? Adjudicator runs cost real BNB per epoch per mandate. At scale this is a real operating expense with no revenue offset. A protocol fee is missing from the contract.

### D5. Nothing is contributed back to the substrate.
You consume 8004scan and the ERC-8004 registry. You write nothing back. Kawal writes measurements into the Reputation Registry. That's a strategic asymmetry — see R5, this is one of the strongest adoption arguments available to you.

### D6. No license clarity on adoption terms, no brand, no team page.
"Adoption as a standalone product with its own brand and team" — you have not made it easy to imagine that. There's no `ADOPTION.md`, no proposed governance, no operating cost model.

---

## CATEGORY E — ENGINEERING & OPERATIONAL

- **E1.** Adjudicator is a single EOA, unrotatable in the deployed contract.
- **E2.** `challengeWindow = 24 hours` with `epochLength` potentially shorter — epochs can settle faster than challenges resolve, so slashes pile up unresolved.
- **E3.** `capital` is `uint96` BNB-only. No BEP-20 mandates, so no USDT/USDC/CAKE-denominated mandates. Excludes most real capital.
- **E4.** No pause / circuit breaker on the market.
- **E5.** `STRIKES_TO_DISMISS = 3` and `CATASTROPHIC_ALPHA_BPS = -1000` are constants, not per-mandate parameters. A principal can't express risk tolerance.
- **E6.** Succession queue has no bid expiry — a losing bidder's bond is escrowed indefinitely with no exit.
- **E7.** No events indexed into a subgraph; the frontend reads chain directly, which will not scale past a few hundred mandates.
- **E8.** No rate-limit handling strategy documented for the 8004scan 30 req/min anonymous tier at registry scale.
- **E9.** `.env.example` exists but there's no documented deploy runbook for a third party.
- **E10.** Fonts self-hosted and no third-party requests — genuinely good, keep it, and *say so* as a security property.

---

## CATEGORY F — NARRATIVE & POSITIONING

- **F1.** README opens by fighting the brief (B5).
- **F2.** Your best asset — the 301,784 / 5 / 473 funnel and the Sybil graph — is buried in `RESEARCH.md`, a file judges may never open. It should be the first thing on the site.
- **F3.** No demo video. SMEAI has a 110-second real screen recording. Judges reviewing 60+ submissions watch video.
- **F4.** No "judge starts here" path. Docket and SMEAI both have one. You are asking a judge to figure out your product from a shader.
- **F5.** No stated failures. Docket publishes *"The agent did not beat the human here."* You publish only wins, which — for a product whose entire thesis is distrust of self-reporting — is a tonal contradiction.
- **F6.** The assay/fineness metaphor (millesimal, hallmark, 375, 999) is gorgeous but undefined on first contact. A judge doesn't know 375 is the lowest hallmarkable grade until you tell them, and you tell them late.

---

# PART II — THE STRATEGIC REFRAME

**Stop rejecting the directory. Swallow it.**

Your current position: *a directory is dishonest, so I built a market instead.*
Your winning position: *a directory is dishonest **until agents have something to lose**. So I built the directory, and the ladder that makes its entries mean something.*

This keeps every part of your thesis and stops you arguing with your customer.

## The Trust Ladder

Every one of the 301,784 agents appears. None are hidden. Each sits on a rung, and the rung is derived, never claimed:

| Rung | Name | Test | Est. population |
|---|---|---|---|
| 0 | **Registered** | Exists in ERC-8004 on BSC | 301,784 |
| 1 | **Resolvable** | Agent card resolves | ~thousands |
| 2 | **Live** | Endpoint answers a real call, measured by us | ~5 today |
| 3 | **Capable** | Wallet has transacted and touched its category's protocols | ? |
| 4 | **Assayed** | Fineness published on-chain (≥375) | 2 today |
| 5 | **Bonded** | Has posted a bond against a live mandate | your 4 |
| 6 | **Settled** | Has ≥N measured epochs of realized alpha | 0 today |

This is devastating as a product because:

1. **It answers the brief literally.** Browse all agents, by category, see how they performed, hire them. Yes.
2. **It makes your research the product.** The funnel *is* the navigation. Every judge sees 301,784 → 5 on the landing page as a working filter, not a claim in a markdown file.
3. **It makes the emptiness of the upper rungs your argument, not your weakness.** "Only 2 agents on BSC are assayable today" is not a gap in your data — it *is* the finding, rendered.
4. **It gives BNB Chain a roadmap they can own.** Adoption means driving agents up the ladder. That's a KPI they can report against. You're not selling a website, you're selling a metric.
5. **It reframes your dust bonds.** Rung 5 with four agents at 0.0008 BNB is no longer "an unconvincing market" — it's "the frontier of a ladder nobody has climbed yet, with the mechanism proven end to end and waiting for supply."

**Tagline shift:**
- From: *"Agents bid for your capital with their own."*
- To: **"301,784 agents. Five you can reach. Two you can assay. Here is the ladder, and what it costs to climb it."**

Keep the bond line as the rung-5 subtitle. It's too good to lose, it's just not the front door.

---

# PART III — THE REBUILD

## R1 — ★ THE PROOF LAYER: kill the local benchmark

**This is the highest-priority engineering work in this document.** It fixes B1, B4, D1, and D2 simultaneously.

### R1.1 Commit the benchmark on-chain at award time

Add to `MandateMarket.sol`:

```solidity
struct Attestation {
    bytes32 observationHash;  // keccak(abi.encode(wallet, blockNumber, valuationWei, priceX96, gasSpentWei))
    uint64  blockNumber;      // the exact BSC block the measurement was taken at
    uint64  takenAt;
}
mapping(uint256 => Attestation) public openAttestation;      // mandateId => opening
mapping(uint256 => mapping(uint32 => Attestation)) public epochAttestation;
```

`award()` requires an opening attestation. `settle()` requires an epoch attestation. **Alpha becomes a function of two on-chain commitments, not a laptop file.**

### R1.2 Publish preimages to Greenfield

BNB Greenfield is BNB Chain's own decentralised storage and they will notice you using it. Every attestation preimage — full valuation breakdown, token balances, pool state, block number, gas — goes to Greenfield, with the object hash matching `observationHash`.

Now anyone can fetch the preimage, hash it, and check it against the chain. The benchmark stops being a claim.

### R1.3 Optimistic settlement with a challenge bond

Replace the trusted adjudicator with a **proposer**:

```
1. Proposer submits epoch alpha + attestation hash + Greenfield pointer.
2. Challenge window opens (currently 24h — make it per-mandate).
3. ANYONE may challenge by posting a bond and submitting a contradicting
   attestation for the SAME block number.
4. On challenge, both attestations are re-derived from pinned public chain
   state by the deterministic verifier (R1.4). The loser's bond goes to
   the winner.
5. Unchallenged after the window → final.
```

Your adjudicator stops being an oracle and becomes an ordinary participant who happens to go first. **The trust seam you honestly flagged is now closed, and closing it is a headline.**

### R1.4 The deterministic verifier — `npx mandate-verify`

Steal directly from `winsznx/mandate`'s `pnpm verify:mandate`, and go further.

```bash
npx mandate-verify --mandate 7 --chain 56
```

It must:
- Read the market contract for the mandate's attestations
- Fetch preimages from Greenfield
- Re-derive the valuation from **public BSC archive state at the pinned block**
- Recompute alpha with its own arithmetic
- Compare against what was settled
- **Never read your database, your API, or your filesystem**
- Exit non-zero on any mismatch

Ship it as a **published npm package**. A judge running one command against your mainnet mandates and getting `ALL 47 EPOCHS VERIFIED` is worth more than any amount of README prose.

### R1.5 Move all local state to Postgres + Greenfield

`.benchmarks/`, `.sessions/` public half, `.agent-state/` → Postgres (you already have Drizzle wired). Secrets stay out. This makes the system deployable by someone who is not you, which is what "adoption" means.

---

## R2 — THE ASSAY ENGINE v2: classify the whole registry

Fixes C1, C2, D5.

### R2.1 Scale from 265 to the full indexable registry

Current: 3,402 indexed / 265 classified. Target: **every agent with a resolvable card, continuously.**

Architecture:
- Worker on a cron, not on-request. You already have `src/worker/`.
- Get the **8004scan Pro key** (AltLayer is a sponsor and offers it as a prize — request it now, 500 req/min vs 30).
- Postgres-backed with a `last_assayed_at` column and a rolling sweep.
- Publish `assay_run` records with timestamps so freshness is visible per-agent.

### R2.2 Classification is your differentiator — make it defensible

`categories: []` across the registry means *everyone* must classify. Yours should be:
- **Multi-signal**: name, description, declared services, MCP/A2A capability flags, **and on-chain evidence of protocol interaction** (has this wallet ever called PancakeSwap NPM? Venus Comptroller? that's your category evidence, not the description text).
- **Confidence-scored**, not binary.
- **Auditable**: every classification shows the signals that produced it.
- **Contestable**: an agent operator can dispute a classification.

On-chain-evidence-weighted classification is something no other team is doing, and it directly serves "data quality beyond basic counts."

### R2.3 Publish exclusion reasons for everything

Steal from `fexx301/MandateX`, which renders an exclusion reason for every candidate that fell out. For every agent not on rung 2+, say *exactly* why: `endpoint 404s`, `agent_wallet == owner_address`, `nonce 0`, `card unparseable`, `registered endpoint is an unsubstituted {agentId} template`.

That last one is MandateX's finding. **Reproduce it independently and cite them.** Citing a competitor's finding you verified yourself is a flex that signals rigour, and judges notice.

### R2.4 Reproduce and publish the indexer footgun

MandateX found that the 8004scan indexer silently ignores `chain_id=56` but honours `chainId=56`, returning six chains unfiltered — inflating any count taken at face value. **Verify this yourself and publish it**, because it means most competing submissions' headline agent counts are wrong. If your number is right and theirs are inflated, say so with the reproduction steps.

### R2.5 The Reputation Autopsy — make the Sybil finding a product

Your Sybil work (4,500 records → 53 wallets → 34 surviving) is buried. Turn it into a live page per agent:

> **Reputation: 12.09 on the official explorer. 0 after de-duplication.**
> 47 of this agent's 49 feedbacks come from 3 wallets that posted 185–204 feedbacks each across 32–35 agents at near-identical cardinality. [See the graph] [Reproduce: `npm run sybil -- 153776`]

This single surface does more for "Data Quality" than any chart. It shows a number, shows the official number, and shows why the official number is false — with a command to check.

---

## R3 — ALTANA: take the 50,000 XP properly

Fixes A2, A3.

1. **Register every session in KeyStore.** Pay the $0.50. Do it for all four categories. `registered: true` across the board.
2. **Four live sessions, one per category**, each with a real spend cap, real allowlist, real expiry, all visible in the Altana explorer.
3. **Build `prove-session-scope.ts`** — steal VEYRA's `proveSessionScope.mjs` wholesale, it's the right idea. Assertions that must run against mainnet or testnet and print pass/fail:
   - session key present on-chain after grant
   - in-scope call succeeds (real tx hash)
   - **out-of-scope call is refused** (wrong target)
   - **wrong selector on an allowed target is refused** (this is your per-selector precision — prove it, VEYRA doesn't)
   - **spend cap breach refused** with the specific error
   - revoke completes
   - key removed from account **and KeyStore**
   - the identical previously-succeeding call now fails
4. **User-facing revocation in the product.** Altana requires *"a user can see what their agent may do, and revoke it, inside the product."* Right now sessions live in a JSON file. There must be a page where a principal sees the allowlist, the remaining cap, the expiry countdown, and a **Revoke** button that sends the transaction.
5. **Wire revocation to dismissal.** You already say revocation *is* dismissal conceptually — make it literal: contract dismissal emits an event, a keeper revokes the session, and the UI shows both. That's an integration nobody else will have.
6. **ERC-8183 `hireErc8183Agent`** on the buyer side, per Altana's bonus.

---

## R4 — THE PAYMENT RAIL: x402 / b402

Fixes A5.

- Implement **b402 selling**: each of your four operated agents exposes a paid endpoint (`GET /agent/:id/status`, `POST /agent/:id/simulate`) priced in USDT, settled over Binance x402. Steal the shape from Agripinaa (permit2-exact, ~0.05 USDT/call).
- Implement **buying**: your marketplace pays other agents over x402 when composing.
- Hiring flow accepts x402 payment as an alternative to a BNB bond mandate, giving you a **low-friction hire path** for rung 2–4 agents that aren't bonded yet. This is important: it means someone can hire from you without the full mandate ceremony, which fixes the friction problem in the Functionality criterion.

---

## R5 — ★ WRITE BACK TO THE SUBSTRATE

This is the strongest adoption argument available to you and it comes from Kawal.

Every assay you run produces a measurement. **Write those measurements back into the ERC-8004 Reputation Registry on BSC.**

Why this is strategically enormous:

- BNB Chain owns the registry. You would be the first product that *improves the asset they own* rather than merely reading it.
- Your own research proves the Reputation Registry is worthless (Sybil-saturated, "meets none of the four necessary conditions"). You would be the first source of **non-Sybil, machine-generated, reproducible feedback** in it.
- It makes adoption self-justifying: adopting MANDATE means the registry gets better every day, for every other consumer, including competitors.
- It converts your product from a consumer of the ecosystem into infrastructure for it.

Frame it exactly that way: *"We found the Reputation Registry is manufactured. Rather than route around it, we're repairing it — every assay we run is written back as verifiable feedback, so the registry gets more honest whether or not you use our front door."*

That sentence, alone, is an adoption case.

---

## R6 — THE AGENT ADVANTAGE REPORT (TermiX gate)

Fixes A1. Build `docs/AGENT_ADVANTAGE_REPORT.md` to a standard nobody else reaches.

TermiX requires ≥3 real tasks run both ways, with time/cost/quality and actual outputs attached, and ≥1 from trading/stock/security. Steal Docket's methodology, which is the most rigorous in the field:

### R6.1 Lock the method before you see results
Publish, timestamped and hashed, **before running**:
- The exact task set and their input hashes
- The scoring rubric
- The definition of the human baseline arm
- The stopping rule

This is Docket's "input lock." It converts your report from marketing into an experiment.

### R6.2 Run six tasks, not three

| # | Task | Category | Human arm | Agent arm |
|---|---|---|---|---|
| 1 | Re-centre an out-of-range PancakeSwap V3 WBNB/USDT position | Rebalancing | Manual: read pool, compute ticks, withdraw, swap, mint | `rebalance.ts` under session |
| 2 | Maintain a grid ladder through a 4h volatility window | Grid | Manual monitoring + orders | `grid.ts` |
| 3 | Rotate stablecoin capital between Venus markets on rate change | Yield | Manual rate check + move | `yield.ts` |
| 4 | Repair a Venus position from HF 1.15 before liquidation | Health Factor | Manual monitor + repay | `health.ts` |
| 5 | **Assay 20 registry agents and identify which are hireable** | **Security** ← *TermiX's required high-stakes category* | Human researcher | Your assay engine |
| 6 | **Detect Sybil reputation on a given agent** | **Security** | Human analyst | `npm run sybil` |

Tasks 5 and 6 are the smartest available play: **your marketplace's own core competency is a security task**, so you satisfy TermiX's high-stakes weighting with the thing you're already best at, and you demonstrate that hiring an agent through your marketplace beats doing it yourself *at the marketplace's own job*.

### R6.3 Measure honestly, and publish losses
Time, cost (gas + fees + API), and quality with an anonymised rubric. **Where the agent loses, say so in bold.** Docket does this and it is the single most credible thing in their submission. TermiX is judging "proven," not "asserted" — an all-wins report reads as unproven.

### R6.4 Attach real artifacts
Transaction hashes, output JSON, screen recordings, raw logs. TermiX says they will hire from your marketplace themselves — make sure the thing they hire produces an artifact they can check.

---

## R7 — PANCAKESWAP TRACK

Fixes A4. You're 80% there and claiming 0%.

- Explicit `docs/PANCAKESWAP.md` stating the benefit: automated V3 liquidity range management that keeps LPs in-range without custody, plus grid execution through the V3 SwapRouter, both bounded by session keys so **user funds are never at risk** (their words: *"without ever putting user funds at risk"* — quote it back).
- Quantify it from Task 1 and Task 2 of the Advantage Report: fees earned in-range vs out-of-range, IL crystallised, gas cost, net.
- Add the research angle they explicitly invited: *"researching market movements to find demand where creating PancakeSwap pools could improve liquidity efficiency."* A **pool-gap scanner** — surfacing pairs with routing demand but thin V3 liquidity — would be a distinct, cheap, high-signal feature that directly matches their prompt and nobody else is building.

---

## R8 — INFORMATION ARCHITECTURE

Fixes B6, C6, F2, F4.

**Route map:**

| Route | Purpose |
|---|---|
| `/` | **The funnel as navigation.** 301,784 → 1 → 2 → 3 → 4 → 5 → 6, each rung clickable. Below it, four category tiles with live counts. This is the front door. |
| `/start` | **Judge path.** Steal from SMEAI. Every claim, where to verify it, one working hire, no wallet required. Under 90 seconds. |
| `/agents` | Full registry, filterable by rung + category + freshness. All 301,784 present, honestly rung-labelled. |
| `/agent/[id]` | **The career page.** Assay breakdown across all six dimensions; reputation autopsy (official score vs de-duplicated); every mandate held; every epoch settled; every slash; every dismissal survived; verify command. |
| `/mandate/[id]` | Attestations, Greenfield preimage links, succession queue, `mandate-verify` command, challenge status. |
| `/floor` | **The WebGL floor moves here.** Keep every pixel. It becomes the market's live view, reached from the home page, with a legend. Not the first thing a stranger meets. |
| `/assay` + `/bench` | Keep. Add: assay *any* agent live, including ones being pitched elsewhere. |
| `/evidence` | Advantage Report, Sybil research, session scope proofs, indexer footgun, all reproduction commands. |
| `/list-your-agent` | **Supply-side onboarding.** Fixes C3. |

---

## R9 — SUPPLY SIDE

Fixes C3, B2.

1. **Self-service listing.** Any agent operator connects a wallet, claims their ERC-8004 identity, requests an assay, sees their rung and exactly what would raise it.
2. **Shadow mandates (paper trading).** An agent can run a mandate **unbonded, with measured results, no capital at risk.** This is the cold-start fix: agents build a settled track record before anyone risks money, and you get rung-6 population without needing real principals on day one. It also gives you an honest answer to B2 — the market has depth because agents can enter before they can afford a bond.
3. **Underwriting / co-bonding.** ★ *Nobody in this hackathon has anything like this.* A third party can post bond **on behalf of** an agent for a share of its fees. This creates a market in agent credit: underwriters with capital price the risk of agents they believe in, and their willingness to co-bond is itself a public trust signal. It solves supply, it deepens the market, and it is a genuinely novel financial primitive for the agent economy.
4. **Bond tiers by mandate size.** Scale `minBond` with capital under mandate, so bonds are always economically meaningful relative to what's at risk.

---

## R10 — CONTRACT v2

Addresses E1–E7, D4.

- **Attestation commitments** (R1.1) — required.
- **Optimistic settlement + challenge bonds** (R1.3) — required.
- **BEP-20 mandates.** `uint96 capital` in BNB only excludes USDT/USDC/CAKE. Most real capital is stablecoin. Add token-denominated mandates.
- **Per-mandate risk parameters.** `STRIKES_TO_DISMISS` and `CATASTROPHIC_ALPHA_BPS` become per-mandate, so a principal expresses tolerance.
- **Per-category benchmarks.** "Hold" is right for grid and rebalancing. It is wrong for the others:
  - Health Factor → benchmark is **the liquidation that didn't happen**. Value preserved vs liquidation penalty avoided.
  - Yield → benchmark is **the best passive rate available at that block**, not hold. An agent that earns 3% when 5% was sitting there has negative alpha.

  This is more honest *and* more informative than a single hold benchmark, and it's a direct hit on Data Quality.
- **Protocol fee** (D4) — a few bps to fund settlement gas. Makes it an adoptable business, not a subsidised demo.
- **Adjudicator rotation + multisig.** Fixes D2.
- **Pause guard.** Fixes E4.
- **Bid expiry** in the succession queue. Fixes E6.
- **Enforce `challengeWindow < epochLength`.** Fixes E2.
- **Re-audit with fuzz + invariant tests** on all new paths. Keep the solvency invariant; add: attestation monotonicity, challenge resolution can never mint value, per-category benchmark arithmetic bounds.

---

## R11 — DATA PIPELINE

Fixes C2, E7, E8.

- Postgres as source of truth; kill the 1.9 MB static JSON.
- **Every figure carries an observation boundary** — the block it was read at, when, and by which run. Steal this from Docket ("each figure carries its observation boundary") and PositionCrew (block-pinned reads reconciled against the Comptroller).
- **Block-pinned reads.** All protocol state read at a single pinned block per computation, reconciled against the protocol's own accounting. PositionCrew does this and it is the strongest Data Quality work in the field.
- **Deliberate exclusions, stated.** PositionCrew excludes incentive rewards from yield comparisons and says why. Do the same and publish your exclusion list — it signals you understand the numbers rather than just fetching them.
- Subgraph or event indexer for market events (E7).
- Documented 8004scan rate-limit strategy, backoff, and cache TTLs (E8).

---

## R12 — CI, UPTIME, RELIABILITY

Fixes C5, D3.

- `.github/workflows/`: typecheck, `forge test`, lint, build.
- **Production smoke test on a schedule** (steal PositionCrew's badge) — hits the live site every 15 min, checks the funnel numbers are fresh, checks sessions are readable, checks the market responds. Badge it in the README.
- **`mandate-verify` runs in CI against mainnet** on every push. Your own proof system, continuously self-checked.
- Documented incident paths for D3: RPC failure mid-settlement, agent endpoint death while holding a mandate, session expiry with an open position.
- Status page.

---

# PART IV — WHAT TO STEAL, AND FROM WHOM

Everything here I verified in the source repos.

| From | Steal | Why |
|---|---|---|
| **VEYRA(egbujor-emmanuel/VEYRA)** | `proveSessionScope.mjs` — six on-chain assertions incl. refusal + revocation | Best Altana evidence in the field. Beat it by also proving *wrong selector on an allowed target* is refused. |
| **VEYRA** | Per-agent proof table with tx hashes in the README | Falsifiable claims beat prose |
| **VEYRA** | `proveHireFlow.mjs` proving the **refund** path | Proving the failure path is more credible than proving the happy path |
| **PositionCrew(qdeeworld/positioncrew)** | Block-pinned reads reconciled against Venus Comptroller | Strongest Data Quality work in the field |
| **PositionCrew** | Deliberately excluding incentive rewards, and saying so | Signals you understand the number |
| **PositionCrew** | CI quality + production smoke badges | Proves uptime through judging |
| **PositionCrew** | No-wallet provider trial | Removes friction from Functionality |
| **Agripinaa(san-npm/agripinaa)** | **Mainnet operation with real agent IDs** | Altana: "testnet counts, mainnet is stronger" |
| **Agripinaa** | Execution quality as **surplus vs signed limit, in bps** | This is what "beyond basic counts" means |
| **Agripinaa** | Downloadable receipt JSON carrying settlement tx + block | Portable proof |
| **Agripinaa** | MEV-protected execution via batch auctions | You currently swap naked on V3 |
| **SMEAI(Elioz404/SMEAI)** | `/start` judge path, no wallet needed | Directly targets the Functionality criterion |
| **SMEAI** | **110-second real screen recording**, no narration, no mockups | Judges watch video |
| **SMEAI** | "Calls every agent before it lists it" as a headline claim | You do more than this and say it less |
| **Docket(Ridwannurudeen/docket)** | **Input lock** — rules fixed before seeing cases | Turns the Advantage Report into an experiment |
| **Docket** | Anonymised evaluator seats | Removes scoring bias |
| **Docket** | Publishing "the agent did not beat the human here" | Most credible thing in the entire hackathon |
| **Docket** | "What is not true yet" section | Pre-empts every criticism a judge could make |
| **KaizenScope(kaizenbnb/BNB-Agent-Marketplace)** | Registry census **committed as JSON the product reads** | Product and research can't drift apart |
| **KaizenScope** | Buyer signs every step from their own wallet | Custody clarity |
| **MandateX(fexx301/MandateX)** | The `chain_id` vs `chainId` indexer footgun | Invalidates competitors' counts |
| **MandateX** | Registry is not `ERC721Enumerable`, `totalSupply()` reverts | Explains why breadth claims must be sourced |
| **MandateX** | Exclusion reason rendered for **every** excluded candidate | Data quality made visible |
| **winsznx/mandate(winsznx/mandate)** | `granted ⊆ tested` as a compiled invariant | Best single idea in the hackathon — and it's abandoned, so it's free |
| **winsznx/mandate** | Independent verifier that never reads their DB | The trust-minimisation move |
| **Kawal** | **Writing measurements back to the Reputation Registry** | Your strongest adoption argument (R5) |
| **Onplaced** | Continuous re-testing on a schedule; trust decays | Freshness as a first-class property |
| **Onplaced** | Honest tiering of check depth (own agents vs third-party) | Don't overclaim what you can verify |

**On `winsznx/mandate` specifically:** it has been dead since 20 August, it shares your name, and it has the sharpest idea in the field. Implement `GrantedEnforceableAuthority ⊆ TestedEnforceableAuthority` as a compiled property in your session grant — an agent's session allowlist is *derived from the capabilities its assay proved*, and if the grant exceeds the assay, the grant does not compile. That closes the loop between your assay engine and your session layer, which is currently the seam in your own architecture (your assay gates *bidding*, but your session allowlist is a hardcoded per-category constant — it should be per-agent and assay-derived).

---

# PART V — NET-NEW INNOVATION (nobody has these)

1. **Underwriting / co-bonding market.** Third parties post bond for agents they believe in, for a share of fees. A market in agent credit. Genuinely novel financial primitive.
2. **Shadow mandates.** Measured track record with no capital at risk. Solves cold start; creates rung-6 supply.
3. **The succession queue as a live surface.** Show the principal exactly who takes over if the incumbent is dismissed, with their bond and target alpha. Nobody else can show "your capital's next manager is already bonded and waiting." It's unique, it's visual, and it makes dismissal feel safe rather than alarming.
4. **Assay-derived session scope.** Your session allowlist compiled from what the assay proved, not hardcoded per category. Closes your own architectural seam and implements winsznx's invariant better than winsznx did.
5. **Per-category benchmarks** (hold / liquidation-avoided / best-passive-rate / un-pooled hold). More honest and more informative than a single benchmark.
6. **Reputation autopsy pages.** Official score vs de-duplicated score, with the Sybil graph and a reproduction command, for any agent in the registry.
7. **Reputation Registry write-back.** Repair the substrate rather than routing around it.
8. **Pool-gap scanner** for PancakeSwap — routing demand vs thin V3 liquidity. Directly matches an invitation in their track brief that nobody took up.
9. **`npx mandate-verify` as a published package.** Your proof system, installable and runnable by anyone against mainnet, in CI, in one command.
10. **Adverse-result publication as policy.** A standing `/evidence` section for measurements that went against you. For a product built on distrust of self-reporting, this is the only tonally coherent position — and it's a moat, because competitors won't copy it.

---

# PART VI — THE ADOPTION CASE

BNB Chain isn't buying a hackathon project. They said: *"we back it as a standalone product with its own brand and team, and incubate it as the discoverability layer for agents on BSC."* They are asking **"can we run this, and will it embarrass us?"**

Write `ADOPTION.md` answering exactly that:

1. **Operating cost model** — gas per settlement, per epoch, per mandate, at 10 / 1,000 / 100,000 agents. Infrastructure cost. Protocol fee revenue against it.
2. **Runbook** — how a BNB Chain engineer deploys and operates it from zero. Prove it by having someone who isn't you follow it.
3. **Key management** — adjudicator multisig, rotation policy, what a compromised key can and cannot do (answer: cannot move principal capital, cannot finalise a challenged settlement).
4. **Failure modes and incident response** — every case in D3.
5. **The write-back commitment** (R5) — the registry improves whether or not the front door is adopted.
6. **The ladder as a KPI** — agents at rung 2, 4, 6 over time. A metric BNB Chain can report in their next AI Agent Landscape post. **Give your acquirer their next blog post.**
7. **Brand and team** — they said "its own brand and team." Have a name, a mark, and a stated team. Make it trivially easy to imagine as a product.
8. **What it is not** — scope boundaries, stated. Prevents the fear of adopting something unbounded.

---

# PART VII — BUILD ORDER

Not a scope reduction — everything above ships. This is dependency order.

**Wave 1 — Credibility floor (nothing else counts without these)**
1. R1.1–R1.2 on-chain attestations + Greenfield preimages
2. R1.4 `mandate-verify`
3. R6 Agent Advantage Report with input lock
4. R3.1–R3.2 KeyStore registration, four sessions, four categories
5. B3 resolve the `minBond` inconsistency

**Wave 2 — The reframe**
6. Part II trust ladder as information architecture
7. R8 route map, `/start` judge path
8. R2.1–R2.3 assay at scale with exclusion reasons
9. R2.5 reputation autopsy

**Wave 3 — Track sweeps**
10. R3.3–R3.6 session scope proofs, in-product revocation
11. R7 PancakeSwap package + pool-gap scanner
12. R4 x402/b402
13. R5 Reputation Registry write-back

**Wave 4 — Depth**
14. R10 contract v2 (attestations, optimistic settlement, BEP-20, per-category benchmarks, protocol fee)
15. R9 supply side: self-service, shadow mandates, underwriting
16. R11 data pipeline, block-pinned, subgraph
17. R12 CI + smoke + status

**Wave 5 — Presentation**
18. Floor relocated with legend
19. Demo video
20. `ADOPTION.md`
21. `/evidence` including adverse results

---

# THE ONE-LINE SUMMARY

You built the best mechanism in the hackathon and pointed it at the wrong target, then made its most important number unverifiable.

Fix the benchmark, swallow the directory, register the sessions, write the report — and there is nothing else in this field at your level.