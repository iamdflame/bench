# CRUCIBLE — the remaining build

Every step states **what**, **why**, and an **exit test**. A step is done when
its exit test passes, not when the code is written. No step is sized against a
deadline.

**Live:** https://crucible-market.vercel.app
**Mainnet:** `ClaimRegistry` `0x91EE15Dd…E170f` · `BondVault` `0xA34B0ED4…4deD2` · `OutcomePolicy` `0xa219d67a…74d80`

---

## Done

| | |
|---|---|
| **A1–A4** The mechanism | `BondVault`, `ClaimRegistry`, `Outcome`, deployed and Sourcify-verified on mainnet. 79 contract tests, four fuzzed at 512 runs. Full cycle proven on testnet: a bond left an agent and arrived at a principal. |
| **Registry** | 310,436 counted, 33,813 walked by cohort, 245 classified into the four jobs, template clustering, the funnel. Incremental pass costs 9 requests. |
| **C1–C2** The floor | Homepage rebuilt as a market: the funnel, four markets, the mechanism with live addresses. |
| **C3** Market pages | Registry supply merged into the board — 65 / 54 / 148 / 33 listed. |

---

# PHASE D — Supply that can actually be hired

Nothing on the board is hireable, because this deployment has never called any
of the 245. That is the single biggest gap between what exists and what a user
can do.

## D1 — Resolve endpoints for every classified agent
The index says an agent declares an endpoint but does not hand over the URL.
Resolve `tokenURI` on chain for all 245, parse `data:`/`ipfs:`/`https:`, and
extract the service endpoints from the card.

**Exit test.** Every classified row carries either an endpoint or a stated
reason it has none, and the counts reconcile with the cohort totals.

## D2 — Probe them
Call every resolved endpoint. Record alive / degraded / dead / never-probed,
latency, and whether a 402 challenge comes back that we could settle on this
chain.

**Exit test.** Rails open on rows that answer, and every closed rail names the
condition that closed it. `check:hireable` — at least one row per job with a
rail open — passes.

## D3 — Agent cards and the A2A handshake
Where an agent serves an agent-card, read its skills and render them.

**Exit test.** An agent page shows what the card declares against what the
probe observed, side by side, each provenance-tagged.

---

# PHASE E — The transaction path

A user can browse. A user cannot yet transact. This is the phase that changes
that.

## E1 — Wallet layer
The existing dependency-free EIP-1193 layer covers connect and sign. Extend to
`eth_sendTransaction`, EIP-712 typed-data signing, and EIP-5792 batching where
the wallet supports it.

**Exit test.** A visitor connects, signs typed data, and sends a transaction
without any wallet SDK entering the bundle.

## E2 — `/post` — post a mandate
Paste an address, read the real position, choose the job, window and cap.
Produces an unsigned mandate other agents can bid on.

**Exit test.** A stranger with a real V3 position posts a mandate without
connecting a wallet, and nothing on the page can move their funds.

## E3 — Deposit and bond from the browser
An agent operator deposits collateral and bonds against a claim, in the UI.

**Exit test.** A bond appears in `BondVault` on mainnet, placed from the site.

## E4 — Sign a claim in the browser
EIP-712 over the `Claim` struct, rendered in full so a wallet shows the promise
rather than a hash.

**Exit test.** A claim signed in the browser opens in `ClaimRegistry` and its
id equals the hash of the terms.

## E5 — `/m/[id]` — the mandate page
Bids, bonds at risk, the trial ranking, and the settle button once the window
closes.

**Exit test.** A mandate settles from the browser and the page shows the
verdict, the arithmetic and the transaction.

## E6 — `/desk` — what is working, and how to stop it
Open mandates, sessions with their allowlists in plain words, and revoke.

**Exit test.** A visitor sees their own mandates by pasting an address, and
revoke lands on chain.

---

# PHASE F — The trial

The replay engine is the moat and it covers one job of four.

## F1 — Grid ladder replay
## F2 — Yield rotation replay against historical rates
## F3 — Health-factor replay against a real price path
## F4 — Multi-window distributions rather than point estimates
## F5 — `/t/[id]` — the trial page, every bid replayed side by side

**Phase exit test.** A stranger pastes an address and gets four categories of
answer, each reproducible by a published command, each with a spread rather
than a single number.

---

# PHASE G — Seed the market

## G1 — Reference agents on their own mainnet wallets, funded
## G2 — Each bonded in its own market
## G3 — `npx crucible init` — scaffold a competing agent in one command
## G4 — `/build` — the studio page
## G5 — `/standard` — the published listing test with its vectors

**Phase exit test.** Bonded agents in all four markets, at least half not ours,
and a third party can run the standard against their own agent and get the same
verdict the site shows.

---

# PHASE H — Partner tracks

## H1 — Altana: agents on their own wallets, sessions with allowlist/cap/expiry, KeyStore registration confirmed, revoke in the UI
## H2 — TermiX: the Agent Advantage Report regenerated from the settlement ledger
## H3 — PancakeSwap: led by `RecipientBound`, with the V3 markets
## H4 — 8004scan: ERC-8004 identity checked on every bid

---

# PHASE I — Production hardening

Everything that stops a site being a demo.

## I1 — Error boundaries and empty states on every route
## I2 — Rate limiting on the public API, and CORS that is deliberate
## I3 — `robots.txt`, `sitemap.xml`, OG images, structured metadata per route
## I4 — A health endpoint that reports what is stale, and `/data` showing the worker's last run
## I5 — The worker on a runner that actually executes, with its cadence published
## I6 — Accessibility pass: focus states, landmarks, contrast, keyboard paths
## I7 — Load: the board must render with 30,000 rows in the store without shipping them

**Phase exit test.** Every route renders correctly with JavaScript off, with an
empty store, and with a third party down. Lighthouse accessibility ≥ 95.

---

# PHASE J — The submission

## J1 — A judge's route: one URL that walks the whole proof in order
## J2 — A recorded run of the full journey
## J3 — Wallet addresses, explorer links, the revoke, for Altana
## J4 — Final `/data` reconciliation: every figure on the site traceable to a command

---

## Gates to add as the phases land

| Gate | Enforces |
|---|---|
| `check:hireable` | Every market has ≥1 row with a rail open |
| `check:classified` | No listed row carries `job: null` |
| `check:provenance` | Every rendered fact carries declared / observed / onchain / derived |
| `check:freshness` | The published snapshot is younger than a stated age, or the site says its age |
| `check:bond` | No listing claims a bond it does not hold on chain |
| `check:settlement` | Every settled mandate reconciles to a transaction |
| `check:a11y` | Landmarks, focus states and contrast on every route |
