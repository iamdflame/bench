# PancakeSwap

MANDATE puts capital to work on PancakeSwap V3 through two of its four agent
categories, and it does so **without ever taking custody of it**.

That phrase is PancakeSwap's own. Their brief asks for agents that improve
liquidity efficiency *"without ever putting user funds at risk"*, and the
architecture here is built around answering it literally rather than
rhetorically.

---

## The benefit, stated plainly

**A concentrated-liquidity position earns nothing while price sits outside its
range.** That is the whole problem, and it is not hypothetical. Measured on
BNB Smart Chain at a block fixed in advance by
[an on-chain input lock](AGENT_ADVANTAGE_REPORT.md):

> Of **1,102 live V3 positions** that someone had touched in the preceding
> three hours, across **141 pools**, **267 — 24.2% — were sitting outside their
> range**, earning nothing.

By fee tier:

| Fee | Live positions | Out of range |
|---|---:|---:|
| 0.01% | 88 | 15 (17.0%) |
| 0.05% | 114 | 19 (16.7%) |
| 0.25% | 404 | 67 (16.6%) |
| **1.00%** | 496 | **166 (33.5%)** |

A third of the 1% tier is idle. These are positions whose owners were active
enough to touch them within the window, so this is not abandoned liquidity —
it is attended liquidity that has drifted.

`src/agents/rebalance.ts` watches a position's ticks against the pool's current
tick and re-centres when price leaves the band: withdraw, collect, mint a fresh
range around spot. Every call it makes is `decreaseLiquidity` or `collect` on
the NonfungiblePositionManager, and it can make no others.

## And the honest half

**On the window the lock chose, the agent would have lost.** Of the nine
positions in the pre-registered sample, none were past the 200-tick re-centring
trigger at the anchor block, and the one that crossed it during the window came
back inside its range on its own. A re-centre there would have paid gas and
crystallised impermanent loss for nothing.

That is the real shape of range management: the tolerance that avoids churn is
the tolerance that misses the shallow exits, and this window had only shallow
exits. It is published as a loss in the report because it was named as one
before the run.

## Grid execution

`src/agents/grid.ts` places levels around an anchor on the WBNB/USDT 0.05% pool
and trades through the V3 SwapRouter's `exactInputSingle`. Run over the
**4,194 real swaps** in the locked window:

| | |
|---|---:|
| Window trend | −1.62% |
| Fills | 31 |
| Gas paid | 0.00024180 BNB |
| Pool fees paid | 0.00193750 BNB |
| **Agent** | **1.00916504 BNB** |
| Holding | 1.00824848 BNB |
| Advantage | **+0.00091656 BNB (+0.091%)** |

Small, on one three-hour window, and it should be read as one. Gas and the
pool's own 0.05% fee are charged on every fill; the fills themselves are
simulated against the observed price path, which is stated in the report rather
than buried.

## Why user funds are never at risk

The agent never holds the principal's keys. It holds an **ERC-8183 session
key** with three bounds, all enforced by the wallet rather than by our good
behaviour:

- a **spend cap** no larger than the mandate's capital;
- an **expiry** that ends with the mandate's term;
- an **allowlist bound to target *and* selector** — an agent permitted to swap
  through the V3 router still cannot call `sweepToken` on it.

That last point is provable, not asserted:

```bash
npm run prove-session
#  ✓ an out-of-scope target is refused         UnauthorizedCall
#  ✓ the wrong selector on an allowed target   UnauthorizedCall
```

And the allowlist is not a category default. It is the intersection of what the
category permits with **the protocols the chain has actually shown that agent
using** — `granted ⊆ proven`, enforced by the type system, so a grant that has
not been through an assay does not compile. Our own agent had to perform a real
V3 swap on mainnet before it could be granted the authority to swap:

```
before   REFUSED — this agent has not been shown using any Grid Trading contract
swapped  https://bscscan.com/tx/0x55add56703fb08f0e002df2758136e19abca84168d61b3347d4d992e7bf7fb7c
after    2 of 2 Grid Trading calls granted, on PancakeSwap V3 Router
```

## The pool-gap scanner

PancakeSwap's brief also invited *"researching market movements to find demand
where creating PancakeSwap pools could improve liquidity efficiency."*

```bash
npm run pool-gap
```

reads every V3 `Swap` in a window, aggregates volume and standing liquidity per
pool, and ranks by **turnover** — volume crossing per unit of depth. A sample
run over one hour: 136,964 swaps across 1,077 pools.

| Pair | Fee | Swaps | Turnover |
|---|---:|---:|---:|
| MITO/WBNB | 0.01% | 327 | 39.92 |
| AKE/WBNB | 0.01% | 1,138 | 27.66 |
| UP/WBNB | 0.01% | 1,557 | 10.66 |
| BULLA/USD1 | 0.01% | 573 | 10.03 |
| 4/USDT | 0.25% | 1,371 | 8.49 |
| … | | | |
| USDT/WBNB | 0.01% | 32,259 | 1.48 |

High turnover means demand is arriving faster than depth is being supplied.

**What it does not claim:** that such a pool is mispriced, that adding
liquidity there would be profitable, or that its fee tier is wrong. Those need
a view on the pair. This is a measurement, and it is reported as one. Pools
with fewer than 20 swaps in the window are excluded, and that exclusion is
deliberate — turnover on a handful of trades is noise.

## Contracts touched

| | |
|---|---|
| V3 SwapRouter | [`0x13f4ea83…68dd4`](https://bscscan.com/address/0x13f4ea83d0bd40e75c8222255bc855a974568dd4) — `exactInputSingle`, `exactInput` |
| NonfungiblePositionManager | [`0x46A15B0b…F4364`](https://bscscan.com/address/0x46A15B0b27311cedF172AB29E4f4766fbE7F4364) — `decreaseLiquidity`, `collect` |
| V3 Factory | [`0x0BFbCF9f…91865`](https://bscscan.com/address/0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865) — pool discovery |
| WBNB/USDT 0.05% | [`0x36696169…52050`](https://bscscan.com/address/0x36696169C63e42cd08ce11f5deeBbCeBae652050) — the price reference |

## Reproducing all of it

```bash
npm run pool-gap                  # the liquidity-gap scan
npm run advantage -- run --only T1,T2,EXPLORE
npm run prove-session             # the session bound, attacked
npm run scope-audit               # what authority our own agent can hold
```

Every figure above comes from `docs/advantage/results/`, measured against a
block fixed by a transaction on BSC **before** any of it was run.
