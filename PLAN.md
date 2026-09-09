# CRUCIBLE

**Agents bid for your capital with their own.**

A capital-allocation market on BNB Smart Chain where an agent cannot be listed
without posting a bond, cannot win a mandate without outbidding rivals on a
measured claim, and cannot miss that claim without being slashed to the person
whose money it was managing.

---

## 0. What was wrong with the last plan

It was a directory with better data. That is what every serious entry in this
hackathon is, and being the best directory is a competition for second place.

Worse, it was a *retreat*. The original framing of this project — recorded in
the public census — was "agents bid for your capital with their own; agents post
bonds and are slashed". That is a genuine financial mechanism. It got replaced
by "three rails plus careful measurement", which is a feature set. This plan
goes back to the mechanism and builds it properly.

The frontend was never touched at all. It is now a first-class deliverable with
its own phase, its own design system and its own gates.

---

## 1. The problem nobody in the field has admitted

Measured on chain 56 by this repository:

| | |
|---|---|
| Registered on BSC | **310,436** |
| Declare a way to reach them | 33,813 |
| Distinct descriptions among those | **3,234** |
| Do any of the four required jobs | **245** |
| Endpoint domain verified | **6** |
| Have ever received one piece of feedback | **509** |

Every entry in this hackathon is building a shopfront for a warehouse with 245
things in it, six of which have a verified address. The winner will not be the
prettiest shopfront. It will be whoever makes the supply *exist* and makes it
*trustworthy* — and those are the same problem, because nothing creates supply
like a market where competence pays and incompetence costs.

**A marketplace cannot fix a supply problem by listing harder.**

---

## 2. The mechanism

Five steps. Every one settles on BNB Smart Chain.

### 1 — Bond
An agent that wants to be listed posts collateral. No bond, no listing. The bond
is the agent's own money and it is at risk from the moment it is listed.

### 2 — Bid
A principal posts a mandate: *"1,000 USDT in a WBNB/USDT V3 position, keep it in
range, 24 hours."* Agents bid. A bid is not a price — it is a **claim** plus the
**bond backing it**:

> *Range Keeper II — 95% time in range, ≤3 recentres, fee 8% of surplus,
> bonded 250 USD1.*

Signed by the agent's own wallet, verifiable against its ERC-8004 identity.

### 3 — Trial
Before a single cent moves, every bid is replayed against **that principal's
real position** using the pool's own swap history. This is the counterfactual
engine that already exists and that no competitor has. The trial is adversarial:
bids are ranked by what they would have done to *this* position, not by
self-reported history.

**The trial is public and reproducible.** Every row carries the command.

### 4 — Mandate
The winner receives an Altana session key scoped to exactly the calls the trial
proved it needs — capped, expiring, revocable, registered in the KeyStore. The
`RecipientBound` wrapper means the session cannot redirect funds anywhere, ever,
because the destination is not a parameter in the interface.

### 5 — Settle
At the end of the window the outcome is read from chain and compared to the
claim.

- **Beat the claim** → the agent takes its fee, its bond returns, its record grows.
- **Miss the claim** → the bond is slashed to the principal, automatically.

The agent's track record is therefore not a review score. It is a history of
money it kept and money it lost, on chain, and it cannot be faked because
faking it costs the bond.

---

## 3. Why this wins on the published criteria

| Criterion | What everyone else does | What CRUCIBLE does |
|---|---|---|
| **Functionality** | Land, browse, click hire | Post a mandate, receive competing bonded bids, watch a public trial, grant a scoped key, settle or slash — end to end, on mainnet |
| **Data Quality** | Counts, probes, uptime | A continuously-run adversarial tournament where every claim has money behind it. The dataset is *generated* by the market, not scraped from a registry |
| **Agent Diversity** | Four category tabs | Four live markets, each with bids, bonds, trials and settlements. Depth is symmetric because the mechanism is identical in all four |

And the meta-prize: BNB is choosing an **Agent Studio marketplace**. A directory
cannot be adopted as infrastructure because it has no economics. A bonded market
with a settlement contract, an agent SDK and a published standard *is*
infrastructure.

---

## 4. Manufacturing the supply

245 agents do the four jobs and most are other hackathon entries. So the market
ships with the means to create competitors.

**`npx crucible init`** scaffolds a competing agent in one command: the strategy
interface, the four job templates, an ERC-8004 registration, an x402 seller
endpoint, a bond deposit, and a local harness that replays the strategy against
real pool history before it ever bids.

This is the "Studio" in *BNB Agent Studio*, and nobody is building it. Everyone
is indexing agents; we make them.

**Target: 40 bonded agents across the four markets by submission, at least 20 of
them not ours.** Every one is real supply that did not exist before.

---

## 5. The contracts

Four, small, each with one job. All tested, all fuzzed, all verified on BscScan.

| Contract | Job |
|---|---|
| `BondVault` | Holds agent collateral. Deposit, lock against a mandate, release, slash. Nothing else. |
| `ClaimRegistry` | Records a signed claim and the bond backing it, so a bid is a commitment rather than a sentence. |
| `Settlement` | Reads the outcome, compares it to the claim, pays the fee or slashes the bond. The only contract that can move a bond. |
| `RecipientBound` | Already built. Removes `recipient` from the interface so a session key cannot redirect funds. |

**Invariants, fuzzed:** a bond can only be slashed by `Settlement`; a bond can
never be slashed twice for one mandate; a slash can never exceed the bond; a
locked bond can never be withdrawn; the principal is the only recipient of a
slash.

---

## 6. The frontend — a floor, not a directory

Every competitor renders a grid of agent cards on a dark page with a gold accent.
CRUCIBLE renders a **market**. This is a full rebuild, not a reskin.

### The idea
The homepage is a live trading floor. Four markets, bids arriving, bonds at risk,
trials running, settlements landing. Nothing on it is decorative and nothing on
it is static, because a market that is not moving is not a market.

### Screens

| Screen | What it is |
|---|---|
| `/` | **The floor.** Four markets side by side. Live tape of bids, trials and settlements. Total bonded, total slashed, open mandates. |
| `/m/[job]` | **One market.** Depth of bids, the current best claim, bonds at risk, the leaderboard by settled record. |
| `/post` | **Post a mandate.** Paste an address, we read the real position, you set the window and the cap. |
| `/t/[id]` | **The trial.** Every bid replayed against this position, side by side, with the command that reproduces it. |
| `/a/[id]` | **An agent's file.** Bonds posted, claims made, claims met, claims missed, slashes taken. A record, not a rating. |
| `/settle/[id]` | **The settlement.** Claim vs outcome, the arithmetic, the transaction. |
| `/build` | **The studio.** One command to a bonded, competing agent. |
| `/standard` | The published test every listed agent passes. |
| `/data` | Every figure's method and block. |

### The look

**Direction: an instrument, not a brochure.** Cold ink ground, mint signal, and
the whole interface built on a monospaced numeric grid — because this is a market
and the numbers are the interface. The field is uniformly warm black-and-gold; a
cold, dense, terminal-grade surface is unmistakable at thumbnail size.

| Token | Value | Role |
|---|---|---|
| Ink | `#0A0F18` | ground |
| Surface | `#101827` | panels |
| Signal | `#5FE3C0` | measured, proven, live |
| Bond | `#F0B429` | money at risk |
| Slash | `#FF6B4A` | a bond taken |
| Quiet | `#64748B` | absent, never red |

**Type.** Display: a tight industrial grotesk. Data: a monospaced face with
tabular numerals, used for *every* figure on the site. Reading: a serif, because
the method notes are meant to be read.

**Motion.** Only ever driven by a data event — a bid arriving, a trial finishing,
a bond being slashed. Nothing decorative moves. The existing `check:motion` gate
already enforces this and stays.

**Both themes, and a real light mode.** Almost the entire field is dark-only.

---

## 7. Partner tracks, all four

| Track | Requirement | How the mechanism satisfies it natively |
|---|---|---|
| **Altana** — 50,000 XP | Own wallets, sessions with allowlist/cap/expiry, KeyStore registration, real onchain txs, user-facing revoke | The mandate *is* an Altana session. Bonded agents each hold their own wallet. Revoke is a button on every open mandate. |
| **TermiX** — $6,000 | Agent Advantage Report: 3+ tasks both ways, ≥1 trading/stock/security | Every settlement is a task run both ways — the agent's arm and the do-nothing arm — with outputs attached. The report writes itself from the ledger. |
| **PancakeSwap** — 1,000 CAKE | Real benefit to PCS traders/LPs, funds never at risk | Rebalancing and grid markets run on PancakeSwap V3. `RecipientBound` is a literal answer to "never at risk". |
| **AltLayer / 8004scan** | ERC-8004 identity | Every bid is signed by a registered ERC-8004 agent and the identity is checked before the bid is accepted. |

---

## 8. What could go wrong, and the answer

| Risk | Answer |
|---|---|
| Nobody bids | The house runs four reference agents that always bid, marked as ours, ranked by the same rule, and never favoured. `check:ranking` already enforces this. |
| A bond is slashed unfairly | Settlement reads the outcome from chain at a pinned block, the arithmetic is on the page, and the dispute window is the ERC-8183 policy's, not ours. |
| The trial is gamed by lookahead | `check:no-lookahead` already corrupts the future and fails if any earlier decision moves. It stays, and now guards money. |
| One replay window flatters an agent | Every claim is trialled over N windows and the distribution is published, not a point estimate. |
| Slashing looks hostile to builders | The bond is small, the fee is real, and a good agent earns more than it risks. The page shows both. |

---

## 9. The bar

Not "a good hackathon project". The bar is that BNB Chain looks at 87 entries and
finds exactly one that shipped a **working financial market** with contracts,
economics, an SDK, a public standard and a terminal-grade interface — and cannot
name a second one close to it.

Every phase below is judged against that, not against a deadline.
