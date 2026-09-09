# Every figure, and how to reproduce it

No number appears on the site or in the README without a method and a command.
Where something could not be measured, it is recorded as unknown with a reason —
never as zero.

---

## The registry

Read against BNB Smart Chain mainnet on 2026-09-09.

| Figure | Value | Method |
|---|---|---|
| Registered on BSC | 310,436 | `GET /agents?chain_id=56&is_testnet=false&limit=1` → `total` |
| Declares an A2A endpoint | 28,461 | same, `&has_a2a=true` |
| Declares an MCP server | 5,578 | same, `&has_mcp=true` |
| Declares an OASF descriptor | 340 | same, `&has_oasf=true` |
| *Claims* x402 support | 71,467 | same, `&x402_supported=true` |
| Endpoint domain verified | **6** | same, `&is_endpoint_verified=true` |
| Has ≥1 feedback | 509 | same, `&min_feedbacks=1` |

```bash
npm run index          # walks the cohorts and recomputes the funnel
```

The funnel is six requests, not a crawl: a filtered population is the `total` of
a one-row page.

### Why "claims" is not "can"

71,467 agents claim x402 support. Our own probe of Binance's B402 Bazaar found
**four** resources on this chain that could actually be paid. Both numbers are
correct. The gap is the difference between saying and doing, which is why the
funnel labels each stage `claimed`, `indexed` or `measured`.

---

## Concentration

| Figure | Value |
|---|---|
| Reachable agents walked | 33,813 |
| Distinct descriptions among them | **3,234** |
| Sharing a description with another row | 91.4% |
| Inside a batch of 100 or more | 87.1% |

Largest batches:

| Count | Owners | Description |
|---|---|---|
| 20,354 | 17,048 | `"<name>.agent on Termix Platform"` |
| 4,954 | 4,922 | `"Gasless stablecoin payment agent on BNB Chain."` |
| 587 | 580 | `"Autonomous Market & Protocol Research agent registered through TermiX."` |
| 577 | 572 | `"Autonomous Automation & Ops agent registered through TermiX."` |

The agent's own name is stripped before comparison. That is the whole reason
this finds batches rather than counting them one at a time: the largest template
varies only by the handle embedded in it. **17,048 distinct owners stand behind
that one sentence**, which is why owner-clustering does not find it either.

None of this is illegitimate. Registering a thousand agents is allowed. What is
not allowed is rendering the registry count as inventory.

---

## The four jobs

Of 33,813 reachable agents, 245 claim one of the four the brief names:

| Job | Agents | Claim x402 |
|---|---|---|
| Yield optimisation | 123 | 12 |
| Rebalancing | 60 | 15 |
| Grid trading | 36 | 9 |
| Health factor | 26 | 16 |

Derived from the agent's own words by a classifier that returns the phrases that
fired, so a label is never a black box. It is a **claim**, labelled as one — the
probe says whether the endpoint answered, and the capability scan says whether
the chain has ever seen that wallet at the venue the label implies. Three
questions, three answers, never blended into a score.

The matching rule is a prefix test at a word boundary, not a substring test. A
substring test reads `dca` out of "podcast" and `apr` out of "AuraPro816" — both
observed on live registry entries.

`npm run check:diversity` fails the build if any job has no supply at all, and
prints the spread on every run. It deliberately does **not** fail on the ratio:
123 against 26 is the registry's fact, and failing over it would only encourage
padding the thin categories.

---

## The rails

**A paid call, mainnet.** 0.01 USD1, settled in
[`0x2e39837b…aae83ca`](https://bscscan.com/tx/0x2e39837b6302da0330ad004db136ab27c90b55f4f35fc89557678df61aae83ca)
at block 120,590,203. The buyer signed an EIP-3009 authorisation and sent no
transaction, so it spent no BNB — the seller's facilitator submitted the
transfer.

```bash
npm run prove-call
```

**A scoped session, mainnet.** Four calls allowed, eight withheld, capped at
0.001 BNB, expiring in fifteen minutes — then attacked. An out-of-scope target
was refused by the account itself: `UnauthorizedCall { target: 0xfd36e2c2…,
data: 0xb0772d0b }`. Revocation landed in
[`0xbbeb10c6…d325b087`](https://bscscan.com/tx/0xbbeb10c6eb6d1d3d5d3de2cdc5da068007b1f5abf2608275f310df2ed325b087).

```bash
npm run prove-scope -- --job rebalancing --wallet 0xcccd447e00fa38a288a8b6c29de52385a8342582
```

**An escrow funded, testnet.** Job 1139 on the ERC-8183 kernel carrying the
quoted terms character for character; one $U left the buyer and sits in the
escrow contract; the kernel reports `FUNDED`. The dispute window is read from
the policy the network actually uses — 900 seconds — not from a constant.

```bash
npm run prove-hire
```

---

## Third-party findings

**Binance's B402 Bazaar lists 979 paid endpoints for BNB Chain. Four can be paid
on BNB Chain.** 941 answered a well-formed challenge asking for payment on chain
**8453** in Base USDC while their listing advertised chain 56. Fifteen answered
404, fourteen timed out, five answered without a challenge.

**Neither BSC USDT nor BSC USDC implements EIP-3009**, read directly from both
contracts — both revert on `authorizationState` and `DOMAIN_SEPARATOR`. USD1 and
$U answer both. All four revert on `version()`, so a client that trusts a
challenge's `extra.version` rather than reading the token signs against the wrong
EIP-712 domain.

**8004scan's offset paging is capped at 10,000**, so it cannot reach past the
newest ~3% of the registry. **A cursor is scoped to the filters that opened the
walk** — `"cursor filters do not match the request"` — so every page must carry
them back.

**The Altana KeyStore is quiet on mainnet.** `0x6572427E…7E0a` carries 8,756
bytes of code and its controller `0x0834Ee2C…6A555` carries 3,609, and neither
emitted a single log in a ~9,000-block window sampled on 2026-09-09.

---

## The replay

`packages/counterfactual` walks a PancakeSwap V3 pool's `Swap` events into a
price series, then drives each strategy across it one observation at a time —
fees computed from the trades that actually happened, gas at the chain's own
price, slippage bounded by the pool's depth at that block.

```bash
npm run counterfactual -- --days 1 --half 60
npm run check:no-lookahead
```

**It is one window, not a track record.** The same replay eight minutes earlier
had every strategy losing. Pointed at the first real position it was given, every
strategy destroyed value, and the page says so rather than hiding it.

A strategy is handed one observation and never the series, so it cannot read
ahead. `check:no-lookahead` corrupts every tick after a cut, replays, and fails
if any earlier decision moved. A test builds a strategy that cheats anyway — a
closure over the series — and asserts the check catches it.

---

## What could not be measured

- **How many registered agents are genuinely distinct.** Template clustering
  finds batches; it cannot prove two differently-worded agents are not the same
  operator.
- **Whether an endpoint that answered will answer again.** A probe is a moment.
  Results decay toward unverified rather than being held as current.
- **Whether the KeyStore registration path works.** No live grant has confirmed
  it, and it is reported unproven rather than rounded up.
