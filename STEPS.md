# CRUCIBLE — build steps

Every step states **what**, **why**, and an **exit test**. A step is done when
its exit test passes, not when the code is written.

No step is sized against a deadline. Where a choice exists between the fast
version and the right version, the right version is specified.

---

# PHASE A — The mechanism

The market cannot exist until money can be bonded, claimed against, and taken.
This is the part no competitor has and the part that takes longest, so it goes
first.

## A1 — `BondVault`
Holds agent collateral. `deposit`, `lock(mandate)`, `release`, `slash`.
Only `Settlement` may slash. Only an unlocked bond may be withdrawn.

**Exit test.** Foundry: a bond cannot be slashed twice for one mandate, a slash
cannot exceed the bond, a locked bond cannot be withdrawn, and only `Settlement`
can call `slash`. Fuzzed at 512 runs on the balance invariant.

## A2 — `ClaimRegistry`
A bid is a signed claim plus the bond backing it. Records `(agent, mandate,
metric, target, fee, bondId)` with the agent's EIP-191 signature over it.

**Exit test.** A claim whose signature does not recover to the agent's ERC-8004
owner is rejected. A claim referencing an unlocked bond is rejected.

## A3 — `Settlement`
Reads the outcome at a pinned block, compares to the claim, pays or slashes.

**Exit test.** Given a claim of "≥95% in range" and a measured 91%, the bond
moves to the principal and the event carries both numbers. Given 97%, the fee
moves to the agent and the bond returns.

## A4 — Deploy and verify on BSC mainnet
All three, verified on BscScan, addresses published on `/data`.

**Exit test.** Every address resolves to verified source on BscScan and is
listed on the site with its deployment transaction.

---

# PHASE B — The trial

The counterfactual engine exists and is the moat. It now has to run as a
tournament rather than a single replay, and cover all four jobs.

## B1 — Multi-bid tournament
Replay every bid on a mandate against the same real position, same window, same
swaps. Rank by outcome against the claim, not against each other's marketing.

**Exit test.** A mandate with five bids produces five replays over one window
and a ranking that is stable when re-run.

## B2 — Grid ladder replay
Extend the engine to simulate ladder fills against real swap events.
**Exit test.** A grid strategy reports fills, fees and net over a real window.

## B3 — Yield rotation replay
Walk Venus/Lista rate history, charge real gas per rotation, compare against
sitting in the best pool at t=0.
**Exit test.** A published run with a reproducing command. The finding is
reported whichever way it points.

## B4 — Health-factor replay
Walk a real collateral price path, simulate top-ups at the declared threshold
against doing nothing.
**Exit test.** Output states how close each arm came to liquidation and what the
defence cost.

## B5 — Distribution, not a point estimate
Every claim trialled over N windows; the spread published.
**Exit test.** No trial figure renders as a single number without its spread.

## B6 — The no-lookahead guard covers money
`check:no-lookahead` already corrupts the future and fails if a decision moves.
Extend it to the three new engines.
**Exit test.** All four strategies pass; a deliberately cheating strategy fails.

---

# PHASE C — The floor (frontend)

A full rebuild. Not a reskin, not a re-theme. The current site is a directory
and the product is a market.

## C1 — Design system
Tokens, type scale, both themes, the numeric grid. One stylesheet, no framework
classes scattered through components.

**Exit test.** Every colour in the app resolves to a token; light and dark both
render every screen legibly; `check:motion` still passes.

## C2 — `/` The floor
Four markets, a live tape of bids/trials/settlements, total bonded, total
slashed, open mandates. Every figure carries its block.

**Exit test.** A thumbnail of the homepage beside the twelve competitor
homepages is not mistakable for any of them. Server-rendered; works with
JavaScript off; inside the JS budget.

## C3 — `/m/[job]` One market, four times
Bid depth, best claim, bonds at risk, leaderboard by settled record. One
template, four markets, identical depth.

**Exit test.** `check:diversity` passes including the supply assertion.

## C4 — `/post` Post a mandate
Paste an address, read the real position, set window and cap.
**Exit test.** A stranger with a real V3 position can post a mandate without
connecting a wallet, and nothing on the page can move their funds.

## C5 — `/t/[id]` The trial
Every bid replayed side by side, with the command that reproduces it.
**Exit test.** Each row's command, run locally, reproduces the number shown.

## C6 — `/a/[id]` The agent's file
Bonds posted, claims made, met, missed, slashes taken. A record, not a rating.
**Exit test.** An agent with a missed claim shows the miss above the fold.

## C7 — `/settle/[id]` The settlement
Claim vs outcome, the arithmetic, the transaction.
**Exit test.** Every settled mandate has a page whose numbers reconcile to chain.

## C8 — Brand
Wordmark, the ascending three-bar rebuilt for the new palette, favicon, OG
images, and the voice carried onto the site verbatim.

**Exit test.** Every screen shot at 1440 and 360; no screen ships unlooked-at.

---

# PHASE D — The studio (manufacturing supply)

245 agents do the four jobs. The market ships the means to create more.

## D1 — `npx crucible init`
Scaffolds a competing agent: strategy interface, four job templates, ERC-8004
registration, x402 seller endpoint, bond deposit, local replay harness.

**Exit test.** From an empty directory, one command produces an agent that
registers, bonds, and places a bid on testnet.

## D2 — The local harness
A builder can replay their strategy against real pool history before bidding.
**Exit test.** The harness refuses to bid if the strategy fails no-lookahead.

## D3 — Seed the market
Reference agents in all four jobs, funded on their own mainnet wallets, bonded,
bidding — and ranked by the same rule as everyone else.

**Exit test.** 40 bonded agents across four markets, at least 20 not ours.
`check:ranking` still fails the build if a house agent outranks a
better-measured third party.

## D4 — `/standard` The published test
The versioned test every listed agent passes, with its own test vectors.
**Exit test.** A third party can run the standard against their own agent and
get the same verdict the site shows.

---

# PHASE E — The rails, completed

## E1 — ERC-8183 escrow on mainnet, seller's submit-and-settle exercised
## E2 — x402 seller endpoint: be a merchant, not only a buyer
## E3 — Quotes signed EIP-191 and verified against the agent wallet
## E4 — `permit2-exact` alongside `eip3009` so USDT holders can pay
## E5 — EIP-5792 batching so a hire is one popup
## E6 — Altana KeyStore registration confirmed by a log a stranger can find

**Phase exit test.** Every market has at least one mandate that ran end to end
on mainnet: bonded, bid, trialled, mandated, settled.

---

# PHASE F — The evidence

## F1 — Agent Advantage Report, generated from the settlement ledger
3+ tasks both ways, outputs attached, ≥1 from trading/stock/security.
**Exit test.** Every row traces to a settled mandate with a transaction.

## F2 — Altana submission
Wallet addresses, explorer links to real session transactions, the revoke.

## F3 — PancakeSwap submission
Led by `RecipientBound`, with the market that runs on V3.

## F4 — The judge's route
One URL that walks the whole proof in order, and a recorded run of the journey.

---

# PHASE G — The gates

Existing gates stay. New ones:

| Gate | Enforces |
|---|---|
| `check:bond` | No listing without a bond; no slash outside `Settlement` |
| `check:claim` | Every bid carries a signature that recovers to its ERC-8004 owner |
| `check:trial` | Every published trial figure carries its window, its swaps and its command |
| `check:settlement` | Every settled mandate reconciles to a transaction |
| `check:classified` | No listed row carries `job: null` |
| `check:provenance` | Every rendered fact carries declared / observed / onchain / derived |
| `check:freshness` | The published snapshot is younger than a stated age, or the site says its age |

---

## Progress

| Step | State |
|---|---|
| **A** The mechanism | not started — **next** |
| **B** The trial | B6 partly (no-lookahead exists) |
| **C** The floor | not started |
| **D** The studio | not started |
| **E** The rails | E6 code done, needs a live grant |
| **F** The evidence | report exists, needs regenerating from the ledger |
| **G** The gates | 6 of 13 |

### Already banked and still useful
- Registry read in full: 310,436 counted, 33,813 reachable, incremental pass 9 requests
- Classification: 245 agents across the four jobs
- Template clustering: 3,234 distinct descriptions behind 33,813 agents
- Counterfactual replay with the no-lookahead proof — the trial engine
- `RecipientBound.sol`, 18 tests, 512-run fuzz
- Mainnet paid call settled; session scope and revocation proven on mainnet
