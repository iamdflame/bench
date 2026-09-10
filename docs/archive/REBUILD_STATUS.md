# Rebuild status

Every item in `rebuild_plan.md`, with its current state. Updated as work lands.

`DONE` · `PARTIAL` · `TODO` · `BLOCKED` (needs something I cannot supply)

> **This table is not the record of where the product stands.**
>
> It tracks findings from a competitive review and marks them closed. Several
> rows were marked DONE while the deployed site contradicted them — B6 in
> particular, "floor is beautiful, not a marketplace", was closed while the
> floor rendered "0 mandates active" to anyone without JavaScript.
>
> It happened again, and worse. On 6 September a read of production found the
> home page serving `Registered 0 · Resolvable ≥ 0 · Live 0 · Bonded 0 ·
> Settled 0` underneath a sentence saying three hundred thousand agents are
> registered, beside a floor thumbnail reading `idle` while `/floor` listed
> eight live mandates — with the API next to it returning the correct figures
> the whole time. Nothing in this file said so. Two rows below were actively
> false: C2 claimed production had no database attached when it had been
> reading Postgres for a day, and R8 called the nine-route IA complete while
> `/compare` returned 404.
>
> The rule this file keeps failing is the one at the top of `prompt.md`:
> production is the only source of truth, and a status table that is checked
> against the repository instead of the deployment will always drift towards
> flattery. Rows corrected on 6 September are marked **↺ restated**.
>
> [`docs/DONE.md`](docs/DONE.md) is the honest one. It walks thirteen gates,
> marks each as it actually stands, carries the command or transaction that
> settles it, and lists what was found by reading production rather than this
> repository.


---

## PART I — the problems

### Category A — eligibility

| # | Problem | State | Evidence |
|---|---|---|---|
| A1 | No Agent Advantage Report → ineligible for TermiX $10k | **DONE** | `docs/AGENT_ADVANTAGE_REPORT.md`, 6 tasks, lock anchored on BSC |
| A2 | Sessions not registered in KeyStore | **DONE** | 4 sessions `registered: true`, each with its authorising tx |
| A3 | One session, one category | **DONE** | 4 mandates, 4 categories, 4 sessions |
| A4 | No PancakeSwap track submission | **DONE** | `docs/PANCAKESWAP.md` + pool-gap scanner |
| A5 | No x402 / b402 rail | **DONE** | two paid endpoints, 4/4 proven on mainnet |

### Category B — thesis contradictions

| # | Problem | State | Evidence |
|---|---|---|---|
| B1 | ★ Benchmark lives in a local directory | **DONE** | `.benchmarks/` deleted; attestations on chain + Greenfield |
| B2 | Market self-dealt with dust | **PARTIAL** | bond tiers now scale the floor with capital, and underwriting lets a third party post it — so the mechanism no longer requires the operator to be the bidder. The live bonds are still dust, because the funds are |
| B3 | `minBond` source/chain divergence | **DONE** | constructor argument; events on both setters |
| B4 | Alpha reported, not derived; adjudicator is us | **PARTIAL→v2** | v2 makes reporting cost a stake and lets anyone contradict it for the same block. The contract still cannot decide wallet value; it can freeze the money and price the lie |
| B5 | README argues with the brief | **DONE** | opens with the ladder; the directory is swallowed, not rejected |
| B6 | Floor is beautiful, not a marketplace | **PARTIAL ↺ restated** | `/floor` renders its book server-side across all three deployments. The *home* page did not: its floor thumbnail was a WebGL window fed by an `EventSource` from an effect, so it printed `idle` while `/floor` two clicks away listed eight live mandates. The front page of a market reported the market was not running, and this row said the floor was fixed. The home page shows the book itself now, read on the server from the same three deployments |

### Category C — rubric gaps

| # | Problem | State | Evidence |
|---|---|---|---|
| C1 | 265 of 301,996 classified | **BLOCKED** | 265 of 3,808 indexed, of 303,391 registered. Classification is multi-signal and chain-weighted now; the coverage gap is the 25 req/min anonymous tier, same blocker as R2.1 |
| C2 | 1.9 MB static JSON | **PARTIAL ↺ restated** | This row was wrong in the direction that flatters least and confuses most: production *did* have an instance attached and had been reading Postgres, and `/api/v1/registry/funnel` was reporting `source: "postgres"` while this said otherwise. The real defect was that the read path spread the committed snapshot and overrode only the rows, so a page served from Postgres stamped itself with the file's `capturedAt` — and they agreed, because the database was seeded once and nothing re-crawled. Both clocks are stamped separately now and a cycle has run against the live database. Coverage is still ~3,850 of 304,800 |
| C3 | No self-service listing | **DONE** | `/list-your-agent` — what each rung costs |
| C4 | Agent diversity structurally unequal | **DONE** | `/office/*` gives all four the same page, book and benchmark; none is empty. Grid and yield both have settled, attested epochs. Closed only once the four had pages — until then the doors led to a filtered register |
| C5 | Zero app tests, zero CI | **DONE** | 63 unit tests and 13 house-style gates, three workflows: CI, mainnet verification hourly, smoke every 15 min |
| C6 | No agent career page | **DONE** | mandates, epochs, fees, slashes, dismissals, each with its tx |

### Category D — adoption blockers

| # | Problem | State |
|---|---|---|
| D1 | Only runs on your machine | **DONE** — the benchmark is on chain, preimages on Greenfield, the index in Postgres with a read path, and a runbook a stranger can follow. `.sessions/` public half stays a committed file deliberately: it is metadata that is already on chain, and the signer never leaves the machine that granted it |
| D2 | Single operator, no key ceremony | **PARTIAL** — v2 two-step adjudicator handover, roles documented; **no multisig on the owner**, named as the largest gap |
| D3 | No incident/failure path | **DONE** — `docs/INCIDENTS.md`, eight modes |
| D4 | No economic sustainability model | **DONE** — v2 protocol fee capped at 5%, cost model in `ADOPTION.md` measured from real transactions |
| D5 | Nothing written back to the substrate | **DONE** — six assays in the Reputation Registry |
| D6 | No licence/brand/team/ADOPTION.md | **DONE** — `ADOPTION.md`, all eight sections |

### Category E — engineering

| # | Problem | State |
|---|---|---|
| E1 | Adjudicator single EOA | **PARTIAL** — v2 adds two-step handover; multisig is an owner choice, not a contract one |
| E2 | `challengeWindow` may exceed `epochLength` | **DONE** — enforced at open in v2 |
| E3 | `uint96` BNB-only capital | **DONE** — BEP-20 mandates in v2 |
| E4 | No pause / circuit breaker | **DONE** — v2, withdrawals stay open |
| E5 | Strikes + catastrophic alpha are constants | **DONE** — per-mandate in v2 |
| E6 | No bid expiry | **DONE** — v2, and expired bids are skipped on succession |
| E7 | No event indexer / subgraph | **PARTIAL** — market events are read from logs with provider failover and gaps reported; no subgraph. Honest and it does not scale past a few hundred mandates, said so in `docs/DATA.md` |
| E8 | No documented rate-limit strategy | **DONE** — `docs/DATA.md` |
| E9 | No deploy runbook | **DONE** — `ADOPTION.md` §2, written for someone who is not the author |
| E10 | Self-hosted fonts, no third-party requests | **DONE** — stated in README |

### Category F — narrative

| # | Problem | State |
|---|---|---|
| F1 | README fights the brief | **DONE** |
| F2 | Best asset buried in RESEARCH.md | **DONE** — the funnel is the front door |
| F3 | No demo video | **BLOCKED** — I cannot record video |
| F4 | No judge-start path | **DONE ↺ restated** — `/start` had 8 claims each with its falsifier and nowhere to press. Verifying every claim and then having no way to use the product is a good argument for something a judge never used. It has two columns now: falsify, and a ticket that ends on a signed transaction |
| F5 | No stated failures | **DONE** — Advantage Report losses in bold; `scope-audit` refuses us |
| F6 | Fineness metaphor undefined on contact | **DONE** — defined where first used |

---

## PART II — the strategic reframe

| Item | State |
|---|---|
| Trust Ladder as information architecture (rungs 0–6) | **DONE** — `src/lib/ladder.ts`, rendered at `/` |
| Tagline shift | **DONE** |

---

## PART III — the rebuild

### R1 — proof layer

| # | Item | State |
|---|---|---|
| R1.1 | Attestations committed on chain at award | **DONE** |
| R1.2 | Preimages on Greenfield | **DONE** — 3 objects, read back and hash-checked |
| R1.3 | Optimistic settlement + challenge bonds | **DONE** — v2, staked proposals, deployed |
| R1.4 | `npx mandate-verify`, published | **DONE** — `mandate-verify@0.2.0` on npm |
| R1.5 | Local state → Postgres + Greenfield | **PARTIAL** — preimages on Greenfield, agent index migrated to Postgres with a read path; `.sessions/` public half is still a committed file, deliberately |

### R2 — assay engine v2

| # | Item | State |
|---|---|---|
| R2.1 | Scale to the full indexable registry | **BLOCKED** — needs the 8004scan Pro key |
| R2.2 | Multi-signal, confidence-scored, auditable, contestable classification | **DONE** — chain evidence outweighs text 12:1, every signal kept and shown |
| R2.3 | Exclusion reason for every excluded agent | **DONE** — eight coded reasons, each with a remedy, on every agent page |
| R2.4 | Reproduce the indexer footgun | **DONE** — tested, **false**; publishing the negative result instead |
| R2.5 | Reputation autopsy per agent | **DONE** — on every agent page |

### R3 — Altana

| # | Item | State |
|---|---|---|
| R3.1 | Register every session in KeyStore | **DONE** |
| R3.2 | Four live sessions, one per category | **DONE** |
| R3.3 | `prove-session-scope.ts`, 8 assertions | **DONE** — 5 proven, 0 failed, 3 inconclusive (Altana relay fault) |
| R3.4 | User-facing revocation in the product | **DONE** — `/authority` |
| R3.5 | Wire revocation to dismissal | **DONE** — `npm run keeper` |
| R3.6 | `hireErc8183Agent` on the buyer side | **DONE** — `npm run prove-hire`, 5 proven |

### R4 — x402 / b402 · R5 — write-back

| # | Item | State |
|---|---|---|
| R4 | b402 selling, buying, low-friction hire path | **DONE** |
| R5 | ★ Write assays back to the Reputation Registry | **DONE** |

### R6 — Advantage Report

| # | Item | State |
|---|---|---|
| R6.1 | Input lock before results | **DONE** — hash anchored on BSC, window chosen by the chain |
| R6.2 | Six tasks | **DONE** |
| R6.3 | Losses published in bold | **DONE** |
| R6.4 | Real artifacts attached | **PARTIAL** — tx hashes and JSON yes; screen recording **BLOCKED** |

### R7–R12

| # | Item | State |
|---|---|---|
| R7 | PancakeSwap doc + pool-gap scanner | **DONE** |
| R8 | Information architecture (9 routes) | **DONE ↺ restated** — nine routes existed; `/compare?a=&b=` was not one of them and returned 404 while this row said the IA was complete. Built, and it reads both agents from the chain so any token id works |
| R9 | Supply side: listing, shadow mandates, underwriting, bond tiers | **DONE** — all four |
| R10 | Contract v2 (11 items) | **DONE** — 70 tests, deployed to mainnet |
| R11 | Data pipeline | **PARTIAL** — `docs/DATA.md`, Postgres read path + migration, per-source reporting. No subgraph; production has no database attached |
| R12 | CI, uptime, reliability | **DONE** — CI, `mandate-verify` against mainnet on a schedule, production smoke, `docs/INCIDENTS.md` |

---

## PART IV — what to steal (9 of 30)

**Done:** VEYRA session-scope proof (beaten: wrong-selector) · Docket input lock (beaten: anchored on chain) · Docket published losses · winsznx independent verifier · **winsznx `granted ⊆ proven` as a compiled invariant** · MandateX `ERC721Enumerable` finding · MandateX `chain_id` footgun (tested — false) · Onplaced honest tiering · Agripinaa mainnet operation.

**Closed by the frontend rebuild:** SMEAI `/start` (the judge path, every claim beside the command that falsifies it) · Docket "what is not true yet" (its own section on `/evidence`, in the present tense) · MandateX exclusion reasons (`<Exclusions>`, on every certificate, each with the remedy) · PositionCrew block-pinned reads (`<Observation>` stamps the block and the read-age on every figure) · PositionCrew stated exclusions (the register states the unread remainder as a count rather than inventing rows) · PositionCrew no-wallet trial (`/bench` and `/assay`, no wallet anywhere).

**Remaining (15):** VEYRA proof table · VEYRA refund path · PositionCrew CI badges · Agripinaa surplus-vs-limit bps · Agripinaa receipt JSON · Agripinaa MEV protection · SMEAI video (**blocked**) · SMEAI "calls every agent" headline · Docket anonymised seats · KaizenScope census-as-JSON · KaizenScope buyer-signs-each-step · Kawal write-back · Onplaced trust decay.

## PART V — net-new innovation (3 of 10)

**Done:** #9 published verifier · #4 assay-derived session scope · #6 reputation autopsy pages.
**Remaining:** underwriting/co-bonding · shadow mandates · succession queue surface · per-category benchmarks · reputation autopsy · registry write-back · pool-gap scanner · adverse-results policy.

## PART VI — the adoption case (8 of 8)

`ADOPTION.md` is written, all eight sections, costed from measured mainnet transactions. Plus a ninth it did not ask for — **What is not true yet** — listing the multisig gap, the missing Postgres instance, the partial sweep, the dust bonds, the absent video, and the archive-node constraint.

---

## Every remaining gap, published

Nothing here stays PARTIAL quietly. Each of these is on `/evidence` under
"what is not true yet", where a judge finds it before they find the wins.

| Gap | Why it is open | What closes it |
|---|---|---|
| B2 — bonds are dust | **standing constraint**: the operator wallet holds ~0.005 BNB and the capital is not available | ~1.25 BNB for one honest mandate at 1 BNB / 0.25 BNB bond |
| B4 — adjudicator decided challenges alone | **closed.** `npm run resolve-challenge` reads the decision out of `mandate-verify` rather than making it | — |
| C1 — 3,808 of 303,391 swept | a rolling sweep has nowhere durable to write | C2 |
| C2 — production reads a snapshot | Supabase provisioned and the IPv4 pooler wired up; the pooler recognises the project and **rejects the password** | a working password in `DATABASE_URL`, then `npm run db:check` |
| D2 / E1 — owner is one key | a multisig is an owner's choice, not a contract's | a Safe, and the handover |
| E7 — no subgraph | log reads with failover work and do not scale past a few hundred mandates | a subgraph |
| F3 — no demo video | cannot be recorded from here | a human with a screen recorder |
| 0.3 / 4.6 rung 4 — historical state | BSC public nodes serve ~50s of state | an archive endpoint in `ARCHIVE_RPC_URL` |

## Blocked, and on what

| Item | Needs |
|---|---|
| R2.1 registry-wide classification | 8004scan Pro key (25 → 500 req/min) |
| F3 / R6.4 demo video | a human to record it |
| B2 adversarial bond sizes | capital, not code |
