# Agent Advantage Report

**MANDATE** · BNB Smart Chain · anchored at block [119939676](https://bscscan.com/block/119939676) on 2026-09-04

Six tasks run with an agent and without one. Two of them are security tasks.
Every no-agent arm is something observable on chain or something a person is
actually shown — none of them is a guess at how long a human would take.

The losses are in here, in bold, because they were named before the run.

---

## The input lock

The method was fixed before any measurement existed, and that claim is
checkable rather than asserted.

| | |
|---|---|
| Specification hash | `0xf9c33aa8c73879a1347ccb902d522c7a0a4b7038806557580531b963baf6c8a6` |
| Committed on chain | [`0x00b0e484c69fc3f149…`](https://bscscan.com/tx/0x00b0e484c69fc3f149f437e0d05ae19cad019bb9b69875a66eaec9fbbbe370e4) |
| Anchor block | [119939676](https://bscscan.com/block/119939676) · 2026-09-04T15:06:09.000Z |
| Measurement window | 119915676 → 119939676 (24,000 blocks, ~3.0h) |
| Gas price used by every cost model | 0.052 gwei — the median of the 142 transactions in the anchor block |

The specification in [`src/advantage/lock.ts`](../src/advantage/lock.ts) is
deterministic — it reads nothing and depends on no clock — so anyone can
recompute its hash from that file alone and compare it with the calldata of
the transaction above. The transaction carries the hash and nothing else.

**The window is chosen by the chain, not by us.** Every task measures backward
from the block the lock transaction happened to land in. At the moment that
block was fixed, none of the results below existed, so the window cannot have
been picked to flatter them.

The runner refuses to execute if the specification no longer hashes to what
was committed. Changing a threshold after seeing a result does not produce a
better number; it produces a refusal.

```bash
npm run advantage -- run          # re-measure against the same anchor
npm run advantage:report          # re-render this file from the results
```

---

## Results

| # | Task | Category | Outcome |
|---|---|---|---|
| T1 | Keep a PancakeSwap V3 position in range | Rebalancing | **Loss.** 0 of 9 sampled positions were past the agent's trigger; the one that crossed it during the window recovered unaided. |
| T2 | Run a grid ladder through the observed price path | Grid | Win. 0.00091656 BNB against holding over a -1.62% window, gas and pool fees charged. |
| T3 | Move stablecoin capital to the best Venus market | Yield | Mixed. The locked metric is unusable and is published anyway. On the 18 markets deep enough to supply into, the spread is 2.49 points and rotation repays its gas above $8.03. |
| T4 | Repair a Venus position before it is liquidated | Health Factor | Win. Being early costs $0.0093; being late costs 10.0% of seized collateral — 53,943× more on the worked example. |
| T5 | Decide which of 20 registry agents are safe to hire | Security | Win on correctness, **loss on coverage.** 20/20 cards contradicted by the chain, but 41 checks could not be answered at all. |
| T6 | Detect coordinated reputation on a registry agent | Security | Win. 3,000 feedbacks from 32 wallets; 99.0% written by the 14 flagged as coordinated. |

3 wins, 1 outright loss, 2 mixed — and one task whose
pre-registered metric turned out to be badly specified, which is published as
specified rather than quietly repaired. That distribution is the point. An
all-wins report from a product built on distrust of self-reporting would be
evidence of a badly chosen task set, not of a good agent.

---

## T1 — Keep a PancakeSwap V3 position in range

**Category:** Rebalancing

**No-agent arm.** Do nothing until you happen to look. Measured on real BSC positions: of the live positions in this pool, how many sit outside their range at the anchor block, and how long they have been there.

**Agent arm.** `src/agents/rebalance.ts`, through the exact predicate
production uses — `shouldRecentre()` is exported and called by both, so the
report cannot be measuring a reimplementation that has drifted.

### What was measured

| | |
|---|---:|
| Positions touched in the window | 2,347 |
| Live in the locked pool at the anchor block | 9 |
| Out of range, earning nothing | 1 |
| Past the agent's 200-tick trigger | 0 |
| Median blocks out of range | 2028 (~15.2 min) |

### **The loss**

**The locked sample is nine positions.** The lock fixed one pool at one fee
tier and a three-hour window, and that is how many live positions it
contained. Nine is too few to carry a percentage, and the stopping rule
forbids widening the sample after seeing that. So it is reported at nine.

**The agent would have churned.** 1 of the sampled
positions crossed the 200-tick trigger during the
window and came back inside its range without the owner doing
anything. A re-centre there would have paid gas and crystallised impermanent
loss to no purpose. On this window, at this tolerance, **doing nothing beat
the agent.**

That is the honest shape of rebalancing: the tolerance that avoids churn is
the tolerance that misses the shallow exits, and this window had only
shallow exits. A wider window with a real trend would favour the agent, and
that is exactly why the window was not allowed to be chosen after the fact.

### Exploratory — outside the lock

Reported separately and never merged into the result above. The same
anchor block, but every PancakeSwap V3 pool rather than the one the lock
named:

| | |
|---|---:|
| Positions touched in the window | 2,347 |
| Live and priceable at the anchor block | 1,102 |
| Distinct pools | 141 |
| **Out of range, earning nothing** | **267 (24.2%)** |
| Past the 200-tick trigger | 209 (19.0%) |

By fee tier:

| Fee | Live | Out of range |
|---|---:|---:|
| 0.01% | 88 | 15 (17.0%) |
| 0.05% | 114 | 19 (16.7%) |
| 0.25% | 404 | 67 (16.6%) |
| 1.00% | 496 | 166 (33.5%) |

About a quarter of the concentrated liquidity that someone actively
touched in those three hours was sitting outside its range, earning
nothing, at the anchor block. This is exploratory and is not the T1
result — but it is the number worth chasing, and the pre-registered
version of this task should have been specified this way.

---

## T2 — Run a grid ladder through the observed price path

**Category:** Grid

**No-agent arm.** Buy and hold. This is not a stand-in for a human — it is the benchmark MandateMarket already settles every grid mandate against, so the agent is judged here exactly as it is judged in production.

**Agent arm.** `src/agents/grid.ts`. `evaluate()` reads nothing from the
chain — it is a function of the price, the balances and its own carried
state — so the production strategy itself was driven over the observed
path, not a copy of its logic.

### What was measured

| | |
|---|---:|
| Swaps recovered from the window | 4,194 |
| Evaluations (one per ~60s, matching the mainnet epoch) | 164 |
| Fills | 31 |
| Price at the start | $724.76 |
| Price at the anchor | $713.00 |
| Window trend | -1.62% |
| Gas paid | 0.00024180 BNB |
| Pool fees paid | 0.00193750 BNB |
| **Agent** | **1.00916504 BNB** |
| Hold | 1.00824848 BNB |
| Advantage | 0.00091656 BNB (0.091%) |

A grid earns from oscillation and loses to trend. This window fell 1.62% with enough chop inside it for the ladder to pay, and the advantage survives real gas at the anchor block's measured price and the pool's own 0.05% fee on every fill. It is a small number on one three-hour window and it should be read as one.

**What this is not.** The fills are simulated against the observed price
path. Each clip is 0.1250 BNB — one eighth of the
working capital — and the simulation assumes a clip that size does not move
the deepest WBNB/USDT pool on BSC. That is reasonable and it is still an
assumption rather than a measurement. **The gas and the pool fees charged
here are real; the fills are modelled.** A live grid would also pay spread
and occasional failed transactions, neither of which is charged above.

---

## T3 — Move stablecoin capital to the best Venus market

**Category:** Yield

**No-agent arm.** Leave capital where it is. Definitional, not estimated: the no-agent arm of a rotation strategy is the absence of rotation.

### **The pre-registered metric was badly specified, and is published anyway**

The lock defined the measurement as the spread between the best and worst
supply APY *among listed Venus markets*. It has no liquidity filter. Run
exactly as written, at the anchor block:

| | Market | APY | Cash in market |
|---|---|---:|---:|
| Best | vUST | 2,491.47% | **$0** |
| Worst | vSolvBTC | 0.00% | $203,430,458 |

**2,491.47 points of spread, and it is worthless.** The top market
is a deprecated Terra stablecoin market holding $0.00 of
cash. Nothing can be supplied into it. The rate is high precisely because
the market is dead.

This is what an input lock is for. Having seen the result, the tempting
move is to add a liquidity filter to the locked metric and report the
sensible number as though it had been the plan. The stopping rule forbids
it, so the flawed metric stands and the sensible reading is reported
beside it, labelled.

### Exploratory — markets holding at least $1M

| | Market | APY | Cash |
|---|---|---:|---:|
| Best | vUSDT | 2.49% | $60.9M |
| Worst | vSolvBTC | 0.00% | $203.4M |

18 of 28 rate-paying markets qualify. Spread: **2.49 points**.

### Does rotating pay for itself

| | |
|---|---:|
| One rotation (redeem, approve, mint) at 0.052 gwei | $0.0167 |
| **Break-even capital** | **$8.03** |
| At the locked $1,000 | $2.08/month |

Above about $8 of capital, one rotation repays its own
gas inside a month. That number is low because BSC gas is cheap, and it is
the number that decides whether this category is worth automating at all —
which is why it was named as this task's loss condition in advance. It did
not become a loss, but it was allowed to.

BNB was $713.00 at the anchor block, read from the pool at that
block rather than from a price API.

---

## T4 — Repair a Venus position before it is liquidated

**Category:** Health Factor

**No-agent arm.** The liquidation that actually happened. Venus publishes its own liquidation incentive on chain, so the cost of not acting is not an estimate — it is a protocol parameter, paid by every borrower who was too slow.

This is the strongest baseline in the report because nothing about it is
modelled. The cost of not acting is a number Venus publishes and charges.

### What was measured

| | |
|---|---:|
| `liquidationIncentiveMantissa` | 1100000000000000000 |
| Borrower's loss on seized collateral | **10.0%** |
| `closeFactorMantissa` | 500000000000000000 |
| Share of a borrow seizable at once | 50% |
| One pre-emptive `repayBorrow` at 0.052 gwei | $0.0093 |
| On a $10,000 borrow, being late costs | $500.00 |
| **Being early against being late** | **53,943×** |

### A note on where that number came from

The Venus Comptroller is a Diamond proxy and **exposes no
`liquidationIncentiveMantissa()`** — that selector and every variant of it
revert with `Diamond: Function does not exist`. The value is still on
chain, in the Unitroller's storage, so it is read from slot 6.

A raw slot read is only worth something if the layout is right, so it is
checked rather than assumed: slot 5 must equal what `closeFactorMantissa()`
returns at the same block. It does. If it had not, the incentive would have
been discarded rather than published.

> Unitroller storage slot 6; layout confirmed by slot 5 matching closeFactorMantissa()

### **The loss**

**Zero liquidations occurred in the window** on the three markets the lock named. The economics above are real and the protocol charges them, but this run produced no observed event to point at — a three-hour window on three markets was too narrow to catch one. The count is reported as zero rather than the window being widened until it found some.

---

## T5 — Decide which of 20 registry agents are safe to hire

**Category:** Security — TermiX's weighted category, and this
marketplace's own competency.

**No-agent arm.** Read the agent card and believe it. This is what the directory actually offers a person: a name, a description, a declared skill set, no evidence.

### What was measured

| | |
|---|---:|
| Agents sampled | 20 |
| Hireable by their card alone | 20/20 |
| **Hallmarked by the assay (fineness ≥ 375)** | **0/20** |
| Cards the chain contradicts | 20/20 |
| Wall clock | 28.5s (1.4s per agent) |

Every one of the twenty presents as hireable. Not one of them clears the
lowest hallmarkable grade. The contradictions are not a single systematic
check failing across the sample — they are four different findings:

| Contradiction | Agents |
|---|---:|
| Identity — no endpoint of any kind | 20/20 |
| Custody — agent wallet is the owner's wallet, byte for byte | 20/20 |
| Reputation | 19/20 |
| Activity — never transacted | 9/20 |

### **The loss**

**41 checks could not be answered at all**, across
20 of the 20 agents. Capability and
Performance were inconclusive for every single agent, because both need log
history and free BSC providers refuse the range. On those two dimensions a
person with a block explorer open can answer and this agent cannot. The
assay says "I don't know" rather than "no evidence", which is the correct
behaviour and still a loss.

**A selection caveat.** The lock fixed the sample as the lowest twenty token
IDs, which are the earliest registrations on the registry and are likely to
include test entries. They are not a random sample of the 301,996
agents on BSC, and this result should not be read as a registry-wide rate.
The selection rule was fixed in advance and is kept; the caveat is stated
rather than the sample being swapped.

---

## T6 — Detect coordinated reputation on a registry agent

**Category:** Security

**No-agent arm.** The reputation score the official explorer displays. Not a proxy for a human — it is the number a human is shown.

### What was measured

| | |
|---|---:|
| Feedback records analysed | 3,000 |
| Pages returned | 30/30 |
| **Distinct reviewer wallets behind them** | **32** |
| Flagged as coordinated | 14 (43.8%) |
| **Share of all feedback written by flagged wallets** | **99.0%** |

3,000 pieces of reputation on the BSC
registry were written by 32 wallets. The busiest:

| Wallet | Feedbacks | Agents reviewed | Max on one agent |
|---|---:|---:|---:|
| `0x397558e5d63a…` | 265 | 254 | 4 |
| `0x96443aec8418…` | 241 | 100 | 8 |
| `0xff1fca025c26…` | 239 | 104 | 8 |
| `0x13749fb015d6…` | 231 | 101 | 6 |
| `0x01b26144bf5c…` | 228 | 91 | 6 |

### Threshold sensitivity

A coordination finding that appears only at one setting of a constant is a
property of the constant. The Jaccard similarity threshold was swept:

| Jaccard | Flagged | Clean |
|---:|---:|---:|
| 0.3 | 14 | 18 |
| 0.4 | 14 | 18 |
| 0.5 | 14 | 18 |
| 0.6 | 14 | 18 |
| 0.7 | 14 | 18 |
| 0.8 | 14 | 18 |
| 0.9 | 14 | 18 |

The flag set does not move — 14 wallets at every
threshold from 0.3 to 0.9.

**Read that carefully rather than as a strength.** It means co-review
similarity is *not* the criterion doing the work; the cohort and
cardinality signals are. The finding is robust, but the sweep tested a
threshold that turns out not to bind, so it is weaker evidence of
robustness than it first appears. Stating that is worth more than claiming
the sweep proved something it did not.

---

## Deviations from the lock

Reported because a pre-registered method with undisclosed deviations is
worse than no pre-registration at all.

| Task | Deviation | Why |
|---|---|---|
| T3 | The locked metric has no liquidity filter and produces a meaningless number. | The metric is published as specified. The liquidity-filtered reading is reported separately and labelled exploratory. Nothing was substituted. |
| T4 | `liquidationIncentiveMantissa` was to be read from the Comptroller. | The Comptroller is a Diamond and exposes no such function. Read from Unitroller storage slot 6, with the layout verified against `closeFactorMantissa()`. |
| T1 | The locked sample size is 120; the locked pool contained 9 live positions. | Reported at n=9. The sample was not widened. An exploratory all-pools scan is reported separately. |
| T2 | Evaluation cadence was not specified in the lock. | Set to ~60s of block time, matching the epoch length the market runs on mainnet. Stated rather than tuned. |

## Instrument errors found during the run

Three measurement bugs were found and fixed before any number here was kept.
Fixing a broken meter is not the same as re-cutting an analysis, but it is
disclosed so the distinction can be checked rather than trusted.

1. **The grid was charged no gas at all.** BSC's `baseFeePerGas` is zero, so
   a cost model built on the block header silently charges nothing. Replaced
   with the median gas price actually paid by the 142 transactions in the
   anchor block: 0.052 gwei.
2. **A 10^154 % APY.** Venus vTokens return three words from
   `supplyRatePerBlock()`, not one. Reading all 96 bytes as a single integer
   produced a number larger than 2^256 has room for. Fixed to decode the
   first word.
3. **A missing Comptroller getter**, described under T4.

## Method

### The scoring rubric

- **Time.** Wall-clock seconds for the agent arm, measured. The no-agent arm is never given an invented duration — where it has no natural duration the comparison is made on correctness or on cost, and the report says which.
- **Cost.** Gas in BNB at the gas price read at the anchor block, plus API calls made. Reported per task.
- **Quality.** A per-task criterion, fixed above in `metric`. No score is aggregated across tasks: a single headline number would hide exactly the losses this report exists to publish.
- **Reporting.** Every task reports win, loss or inconclusive against the criteria declared above. Losses are set in bold. An all-wins report is evidence of a badly chosen task set, not of a good agent.

### What counts as a no-agent arm

```
The no-agent arm is never a guess at how long a person would take.

Every submission can assert "a human needs 45 minutes". None can show it. So
this report only uses baselines that are themselves observable:

  - what people on BSC demonstrably did, or did not do, with their own capital
    (T1, T4);
  - the benchmark the contract already settles against (T2);
  - the definitional absence of the action (T3);
  - the artifact a person is actually shown and would actually act on (T5, T6).

Where a task has no observable human arm, it is not in the report.
```

### Stopping rule

```
One run, against the anchor block fixed by the lock transaction.

  - Inputs are exactly those above. No task is re-run with a different window,
    a different sample or a different threshold after its result is known.
  - A task that cannot be measured reports inconclusive. It is not dropped, and
    it is not retried until it produces a number.
  - A task that loses is published as a loss. The report is not re-cut to
    exclude it.
  - Nothing is added to the task set after the anchor block is known.
```

### Reproducing this

```bash
git clone https://github.com/iamdflame/mandate-bnb && cd mandate-bnb && npm install

# 1. confirm the published spec hash matches the committed one
npm run advantage:lock -- --dry
#    → 0xf9c33aa8c73879a1347ccb902d522c7a0a4b7038806557580531b963baf6c8a6
#    compare with the calldata of 0x00b0e484c69fc3f1… on BscScan

# 2. re-measure against the same anchor block
npm run advantage -- run
```

Tasks that read state at the anchor block need a provider that serves
archive state; of thirteen public BSC endpoints probed, two do
(`bsc.drpc.org`, `bsc-mainnet.public.blastapi.io`) and one serves
`eth_getLogs` over a range (`bsc.rpc.blxrbdn.com`). The runner tries each in
order and reports exhaustion rather than returning an empty answer, because a
silent zero is the worst possible failure in a document whose only claim is
that its numbers were measured.

---

*Generated from [`docs/advantage/results/`](advantage/results) by*
*[`src/scripts/advantage-report.ts`](../src/scripts/advantage-report.ts). Editing this file by hand does nothing;*
*the next render overwrites it.*

