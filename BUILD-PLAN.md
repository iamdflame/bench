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
| **P6** `OutcomePolicy` | — nothing | — | **not started** |
| **P7** Supply and usage | — no Studio on-ramp, no seller dashboard | — | **not started** |
| **P8** Polish | Motion layer, footer, mobile to 360px, 8 gates | Smoke green against production | **ongoing** |

---

## §11 Information architecture — routes

| Required | State |
|---|---|
| `/` `/j/[job]` `/a/[chain]/[id]` `/hire/[chain]/[id]` `/desk` `/register` `/data` `/list` | all present |
| `/api/v1/*`, `/api/mcp`, `/.well-known/agent-card.json` | present |
| **`/api/a2a`** | **missing** |

## §8 Agents hiring agents — MCP tools

| Tool | State |
|---|---|
| `find_agents`, `read_agent`, `plan_hire`, `list_agent` | present |
| **`counterfactual`**, **`request_quote`** | **missing** |

## §12 Screen specifications

| Requirement | State |
|---|---|
| 12.1 no marketing hero; inventory is the homepage | done |
| 12.1 four job doors, equal width, live hireable count, block-stamped | done |
| 12.1 unhireable rows listed with the specific reason | done |
| 12.1 honesty line at the bottom, muted, linking `/data` | done |
| **12.1 `FOR YOU` column — the counterfactual, per row** | **missing** |
| 12.2 counterfactual first, above the record and the rails | done |
| **12.2 `▸ Every check we ran against the chain` — the §15 ladder** | **missing** |
| **12.2 `▸ Reputation` — raw vs sybil-filtered, flagged cohort** | **to verify** |
| 12.3 may / may-not, custody, signatures declared before the button | present |
| **12.4 `/desk` projected vs actual side by side** | **missing** |

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

The ladder is computed but **not rendered anywhere**. Rungs 0–6 are derivable from data already
held; rung 7 is unobtainable (see the B402 note below); rung 8 needs a settled BENCH job.

## §6 / P6 — `OutcomePolicy`

`contracts/src/` holds `RecipientBound.sol` only. The contract, its oracles and its tests are not
started.

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
| 10 | An agent hires from BENCH over MCP with no browser | **owed** |

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
