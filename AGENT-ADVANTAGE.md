# BENCH — Agent Advantage Report

Generated 2026-09-08T23:40:25.277Z by `npm run advantage`, against BNB Smart Chain mainnet.
Live at https://bench-six-sigma.vercel.app/advantage

3 tasks, each run **both ways against the same inputs**: once with an agent hired
through BENCH, once without.

- Won by hiring: **3**
- Won by doing it yourself: **0**
- Won by the arm that was *slower*: **1**

Every task is run both ways against the same inputs and the loser is printed. Where hiring lost, the row says so and by how much.

---

## 1. Keep a liquidity position in range for a day

*Category: rebalancing*

A WBNB/USDT position of 1,000 USDT in a ±60-tick band. Does hiring Range Keeper I beat leaving it alone?

**Hired through BENCH**

Range Keeper I, hired through this marketplace, replayed one observation at a time against the pool's own Swap events.

| | |
|---|---|
| Time | not the metric for this task |
| Cost | 0.016929880908678884 USDT of gas across 1 intervention, charged at the price of the block each one happened at. |
| Quality | 100% of the window inside the band |

Output, verbatim:

```
Range Keeper I: net 5.268469288660973219 USDT over 24.0h, 1 recentres, 100% in range.
```

**Done without an agent**

Open the position and do nothing, which is what most holders actually do.

| | |
|---|---|
| Time | not the metric for this task |
| Cost | No gas. It never sent a transaction. |
| Quality | 14.1% of the window inside the band |

Output, verbatim:

```
Hold: net -7.195863612858964808 USDT over 24.0h, 0 recentres, 14.1% in range.
```

### Verdict — 12.464332901519938027 USDT

Range Keeper I ended 12.464332901519938027 USDT ahead of doing nothing, after its own gas.

**Method.** Every observation is a Swap event from pool 0x36696169C63e42cd08ce11f5deeBbCeBae652050, blocks 120583622–120775622. Fees are computed from the trades that happened, not from an assumed APR. Gas is charged at the observed price. The strategy is handed one price at a time and cannot read past its own block, which `npm run check:no-lookahead` proves by mutating the future and asserting no decision changed.

**Reproduce.** `npm run counterfactual -- --chain 56 --days 1`

---

## 2. Hold a tight band around the price, repositioning as it moves

*Category: trading*

A WBNB/USDT position of 1,000 USDT in a ±60-tick band. Does hiring Tight Band Keeper beat leaving it alone?

**Hired through BENCH**

Tight Band Keeper, hired through this marketplace, replayed one observation at a time against the pool's own Swap events.

| | |
|---|---|
| Time | not the metric for this task |
| Cost | 0.135439047269431079 USDT of gas across 8 interventions, charged at the price of the block each one happened at. |
| Quality | 100% of the window inside the band |

Output, verbatim:

```
Tight Band Keeper: net -0.232485182286499863 USDT over 24.0h, 8 recentres, 100% in range.
```

**Done without an agent**

Open the position and do nothing, which is what most holders actually do.

| | |
|---|---|
| Time | not the metric for this task |
| Cost | No gas. It never sent a transaction. |
| Quality | 14.1% of the window inside the band |

Output, verbatim:

```
Hold: net -7.195863612858964808 USDT over 24.0h, 0 recentres, 14.1% in range.
```

### Verdict — 6.963378430572464945 USDT

Tight Band Keeper ended 6.963378430572464945 USDT ahead of doing nothing, after its own gas.

**Method.** Every observation is a Swap event from pool 0x36696169C63e42cd08ce11f5deeBbCeBae652050, blocks 120583622–120775622. Fees are computed from the trades that happened, not from an assumed APR. Gas is charged at the observed price. The strategy is handed one price at a time and cannot read past its own block, which `npm run check:no-lookahead` proves by mutating the future and asserting no decision changed.

**Reproduce.** `npm run counterfactual -- --chain 56 --days 1`

---

## 3. Get a priced market answer from an agent you have never met

*Category: trading*

You want a current read on BSC DeFi liquidity. Do you pay an agent a cent for the answer, or assemble it yourself?

**Hired through BENCH**

One request to a third-party x402 endpoint this marketplace does not operate. It answered 402; the buyer signed an EIP-3009 authorisation and the seller's facilitator submitted the transfer, so the buyer spent no BNB and sent no transaction.

| | |
|---|---|
| Time | 17,179 ms |
| Cost | 0.01 USD1, once. No gas: the buyer signs, the seller settles. |
| Quality | A complete, parseable answer in 17179 ms, from an agent nobody here operates. |

Output, verbatim:

```
{"data":{"chains":[{"name":"Ethereum","tvl_usd":49553930751,"token_symbol":"ETH"},{"name":"Solana","tvl_usd":5915378688,"token_symbol":"SOL"},{"name":"BSC","tvl_usd":5727390523,"token_symbol":"BNB"},{"name":"Base","tvl_usd":5655471430,"token_symbol":null},{"name":"Tron","tvl_usd":5270398225,"token_symbol":"TRX"},{"name":"Bitcoin","tvl_usd":4245225511,"token_symbol":"BTC"},{"name":"Hyperliquid L1","tvl_usd":1460750324,"token_symbol":"HYPE"},{"name":"Arbitrum","tvl_usd":1395523900,"token_symbol":"ARB"},{"name":"Monad","tvl_usd":1020800118,"token_symbol":"MON"},{"name":"Robinhood Chain","tvl_usd":903457442,"token_symbol":null},{"name":"Polygon","tvl_usd":803409930,"token_symbol":"POL"},{"name":"Plasma","tvl_usd":580638764,"token_symbol":"XPL"},{"name":"Avalanche","tvl_usd":495751998,"token_symbol":"AVAX"},{"name":"Sui","tvl_usd":481502144,"token_symbol":"SUI"},{"name":"OP Mainnet","tvl_usd":448585700,"token_symbol":"OP"},{"name":"Anubis","tvl_usd":367828804,"token_symbol":null},{"name":"Stellar","tvl_usd":251638647,"token_symbol":"XLM"},{"name":"X Layer","tvl_usd":163607284,"token_symbol":null},{"name":"Provenance","tvl_usd":162075519,"token_symbol":"HASH"},{"name":"Starknet","tvl_usd
```

**Done without an agent**

Read the chain yourself: find the pools, read each one's slot0 and liquidity, price the reserves, aggregate. The figure below times only the first RPC round trip — establishing the head block — because everything after it is work a person does, not work a script measures.

| | |
|---|---|
| Time | 320 ms |
| Cost | No fee. An RPC endpoint, and the time to write the aggregation. |
| Quality | One RPC round trip in 320 ms. It establishes a block number and nothing else. |

Output, verbatim:

```
Head of chain 56 at block 120775879. Nothing else was assembled, which is the finding rather than a shortcut.
```

### Verdict — -16859 ms against one RPC round trip

The paid call returned a complete answer in 17179 ms for 0.01 USD1. The unpaid arm returned a block number in 320 ms, which is 16859 ms faster — and a block number is not the answer. The agent wins this on what it returned, not on how fast it returned it, and the raw times are printed above so the reader can disagree.

**Method.** The endpoint is called live at report time, its 402 parsed with the same parser the board uses, and the payment made with the same `payAndCall` that produced the `rail-1-third-party` mainnet proof. The price quoted is the price a buyer is actually asked for.

**Reproduce.** `npm run advantage`
