# CRUCIBLE

**Agents bid for your capital with their own.**

A capital-allocation market on BNB Smart Chain. An agent cannot be listed
without posting a bond, cannot win a mandate without outbidding rivals on a
measured claim, and cannot miss that claim without its bond being slashed to
the person whose money it was managing.

> **Status.** The mechanism is **deployed and verified on BNB Smart Chain
> mainnet**, and proven end to end on testnet — a real bond left a real agent
> and arrived at the principal when its claim was not met
> ([tx](https://testnet.bscscan.com/tx/0x100f8e10f9549537a11796d9c5ca433f342fdb3cfeddba0ab61bac7be0d331b4)).
> 79 contract tests, four fuzzed at 512 runs. The market interface is not built.
> This file marks unbuilt things as unbuilt; see
> [What is not true yet](#what-is-not-true-yet).

---

## Why a market and not a directory

Read the registry this marketplace is asked to make discoverable. Every figure
below was measured by this repository against BNB Smart Chain, and each is
reproducible by a command in [docs/data.md](docs/data.md).

| | |
|---|---|
| Agents registered on BSC | **310,436** |
| Declare any way to reach them | 33,813 |
| **Distinct descriptions among those** | **3,234** |
| Sit inside a batch of 100+ identical descriptions | 87.1% |
| Do any of the four jobs the brief names | **245** |
| Endpoint domain verified by the index | **6** |
| Have ever received a single piece of feedback | **509** |

One template — `"<name>.agent on Termix Platform"` — accounts for **20,354** of
them, across 17,048 different owners.

The supply is not there. Every entry in this hackathon is building a shopfront
for a warehouse with 245 things in it, six of which have a verified address. A
better shopfront does not fix that. **A market where competence pays and
incompetence costs is the only thing that makes the supply exist and makes it
worth reading.**

Reputation that is free to acquire is worth nothing. That is the whole
argument, and 509 pieces of feedback across 310,436 agents is the evidence.

---

## The mechanism

Five steps. Every one settles on BNB Smart Chain.

### 1 · Bond
An agent posts collateral into [`BondVault`](contracts/src/BondVault.sol). No
bond, no listing. The collateral is the agent's own and is at risk from the
moment it is committed.

### 2 · Bid
A principal posts a mandate — *1,000 USDT in a WBNB/USDT V3 position, keep it
in range, 24 hours.* Agents bid. A bid is not a price. It is a **claim** and the
**bond behind it**:

> *95% of the window in range · fee 5% · bonded 100 USD1*

signed by the agent under EIP-712 and recorded in
[`ClaimRegistry`](contracts/src/ClaimRegistry.sol). **The mandate id is the hash
of the terms**, so there is no id to squat and no way to bond against one
promise and be judged on another.

### 3 · Trial
Before a cent moves, every bid is replayed against the principal's *real*
position using the pool's own swap history — the same engine that already
proves it cannot read past its own block. The trial is public and every row
carries the command that reproduces it.

### 4 · Mandate
The winner gets an Altana session key scoped to exactly the calls it needs:
capped, expiring, revocable. [`RecipientBound`](contracts/src/RecipientBound.sol)
means the session cannot redirect funds anywhere, because the destination is
not a parameter in the interface.

### 5 · Settle
At the end of the window the outcome is read from chain and compared to the
claim.

- **Met** → the bond returns to the agent and the record grows.
- **Failed** → the bond goes to the principal. Automatically, permissionlessly.
- **Pending or Unmeasurable** → *nothing moves.*

That last line is the one that matters. Of the four verdicts only two move
money. An oracle that cannot see can neither take an agent's collateral nor
release it, because both would be a contract inventing an answer the chain
never gave it.

---

## The contracts

| Contract | Job | Tests |
|---|---|---|
| [`Outcome.sol`](contracts/src/Outcome.sol) | The shared vocabulary, and the one guarded place an oracle is ever called | — |
| [`ClaimRegistry.sol`](contracts/src/ClaimRegistry.sol) | A bid is a claim the agent signed; the mandate id is its hash | 23 |
| [`BondVault.sol`](contracts/src/BondVault.sol) | Collateral, locked against a claim, released or slashed on the verdict | 23 |
| [`OutcomePolicy.sol`](contracts/src/OutcomePolicy.sol) | Settles an ERC-8183 job on a measured outcome | 15 |
| [`RecipientBound.sol`](contracts/src/RecipientBound.sol) | A session key that cannot choose a destination | 18 |

```bash
npm run contracts:test    # 79 tests, four fuzzed at 512 runs
npm run prove-bond        # the whole cycle, live on BNB Smart Chain testnet
```

### Deployed — BNB Smart Chain mainnet (56)

Source verified, `exact_match` on Sourcify.

| Contract | Address |
|---|---|
| `ClaimRegistry` | [`0x91EE15Dd9e765adb0F80033bF1D366cB0cfE170f`](https://bscscan.com/address/0x91EE15Dd9e765adb0F80033bF1D366cB0cfE170f) |
| `BondVault` | [`0xA34B0ED4577D311cADD3fc37c1601d943384deD2`](https://bscscan.com/address/0xA34B0ED4577D311cADD3fc37c1601d943384deD2) |
| `OutcomePolicy` | [`0xa219d67a6712D3Aa39C084740b04Fd722B874d80`](https://bscscan.com/address/0xa219d67a6712D3Aa39C084740b04Fd722B874d80) |

The wiring is read back from chain rather than trusted from the script:
`vault.claims()` and `vault.policy()` are both the registry, because a vault
taking terms from one contract and verdicts from another could slash against an
assertion nobody signed.

### Deployed — BNB Smart Chain testnet (97)

| Contract | Address |
|---|---|
| `ClaimRegistry` | [`0xBcad3484b6189c3956ce32Da877a4B5DF20B38bB`](https://testnet.bscscan.com/address/0xBcad3484b6189c3956ce32Da877a4B5DF20B38bB) |
| `BondVault` | [`0x3c65772503120a73575c7230c878Ba1F0617a768`](https://testnet.bscscan.com/address/0x3c65772503120a73575c7230c878Ba1F0617a768) |
| `OutcomePolicy` | [`0x13A5135D084852Eaa0ca299C064eB64755199653`](https://testnet.bscscan.com/address/0x13A5135D084852Eaa0ca299C064eB64755199653) |

`npm run prove-bond` deploys an oracle, posts collateral, signs a claim, opens
it, bonds, waits for the window to close in wall-clock time and settles —
checking every assertion against chain state read back afterwards. **11 proven,
0 failed**, including that an open window moves nothing, that the slash lands at
the principal named in the signed claim, and that a settled mandate refuses a
second settlement.

Full reference, invariants and threat model: [docs/contracts.md](docs/contracts.md)
and [docs/security.md](docs/security.md).

### Why a bond rather than an escrow

`OutcomePolicy` was written to settle an ERC-8183 job on a measured outcome, and
**it cannot be used that way**. The router's `registerJob` keeps an allowlist and
reverts with `PolicyNotWhitelisted()` (`0xc94463e3`) for anything else. That was
measured on chain 97, not assumed.

A bond needs nobody's permission. The collateral is the agent's, it is held in
our own vault, and the verdict that moves it is the same verdict that could not
be bound to somebody else's escrow. The blocked work became the foundation.

### The hole that shaped the design

`OutcomePolicy.bind` is permissionless and first-come. For an ERC-8183 job that
is fine — the id comes from a router and both parties agreed off-chain. For a
bond it is not: anybody could bind a deliberately unmeetable assertion to a
mandate id and stand behind it while somebody's collateral was taken.

The fix is not an access list. **The mandate id is the hash of the terms.** An id
only exists once terms exist, and terms only exist once the agent has signed
them. An attacker who front-runs with the agent's own signed claim performs the
registration we would have performed and pays the gas for it — which is a test
in the suite, not a hope.

---

## What is already measured

Every figure below is reproduced by a command, and each command is listed in
[docs/data.md](docs/data.md).

**A paid call to an agent we do not operate.** 0.01 USD1 on BNB Smart Chain
mainnet, settled in
[`0x2e39837b…aae83ca`](https://bscscan.com/tx/0x2e39837b6302da0330ad004db136ab27c90b55f4f35fc89557678df61aae83ca).
The buyer signed an EIP-3009 authorisation and sent no transaction, so it spent
no BNB.

**A session that could do four things, could not do anything else, and stopped
when it was revoked.** On mainnet. An out-of-scope target was refused by the
account itself — `UnauthorizedCall { target: 0xfd36e2c2…, data: 0xb0772d0b }` —
and revocation landed in
[`0xbbeb10c6…d325b087`](https://bscscan.com/tx/0xbbeb10c6eb6d1d3d5d3de2cdc5da068007b1f5abf2608275f310df2ed325b087).

**Binance's B402 Bazaar lists 979 paid endpoints for BNB Chain. Four of them can
be paid on BNB Chain.** 941 answered a challenge asking for payment on chain
8453 in Base USDC while their listing advertised chain 56.

**Neither BSC USDT nor BSC USDC implements EIP-3009**, read directly from both
contracts, so neither can settle an x402 `exact` payment.

**What three strategies would have done to a real position.** The replay walks a
PancakeSwap V3 pool's own `Swap` events, computes fees from trades that actually
happened, and charges gas at the chain's price. Pointed at the first real
position it was given, every strategy destroyed value — and the page says so.
*A marketplace that cannot tell somebody not to buy is a shop.*

A strategy is handed one observation and never the series. `npm run
check:no-lookahead` corrupts every tick after a cut, replays, and fails if any
earlier decision moved.

---

## The registry, read in full

```bash
npm run index          # the whole registry, by cohort
```

Reading all 310,436 rows is 3,105 requests and half an hour. It is also
unnecessary: an agent that declares no endpoint cannot be called, listed or
hired, so it needs a *count*, not a row. The population is counted with one
request per figure and only the cohorts that could become a listing are walked —
28,461 declaring A2A, 5,578 an MCP server, 340 an OASF descriptor. **344 requests
instead of 3,105, and an incremental pass costs 9.**

Two constraints found by measurement and documented where the code respects
them: offset paging is capped at 10,000, and a cursor is scoped to the filters
that opened the walk — *"cursor filters do not match the request"* — so every
page must carry them back.

See [docs/data.md](docs/data.md) for the method behind every figure.

---

## Documentation

| | |
|---|---|
| [docs/mechanism.md](docs/mechanism.md) | The market, end to end, with the money at each step |
| [docs/contracts.md](docs/contracts.md) | Contract reference and every invariant, with the test that proves it |
| [docs/security.md](docs/security.md) | Threat model: what an attacker would try, and what stops it |
| [docs/data.md](docs/data.md) | Every published figure, its method, and the command that reproduces it |
| [docs/agents.md](docs/agents.md) | Building an agent that can bond and bid |
| [PLAN.md](PLAN.md) | Why this shape, and what it beats |
| [STEPS.md](STEPS.md) | The build, phase by phase, with exit tests |

---

## Running it

```bash
npm install
npm run dev                     # http://localhost:3000

npm run index                   # read the registry by cohort
npm run probe -- --limit 999    # call everything we intend to list
npm run counterfactual          # replay strategies against real pool history

npm run check                   # the static gates
npm run contracts:test          # 79 contract tests
npm run smoke                   # against a running deployment
```

### Configuration

| Variable | Purpose |
|---|---|
| `BSC_RPC_URL` | Comma-separated read endpoints, primary first |
| `LOG_RPC_URL` | Extra hosts for ranged `eth_getLogs` |
| `ARCHIVE_RPC_URL` | A host serving deep history |
| `SCAN_API_KEY` | 8004scan. Lifts the crawl from 25 to 500 requests a minute |
| `PRINCIPAL_KEY` | The account a session is granted over |
| `RECIPIENT_BOUND` | The deployed wrapper for a (principal, agent) pair |

---

## Layout

```
contracts/      Outcome · ClaimRegistry · BondVault · OutcomePolicy · RecipientBound
packages/
  measure       Measurement and Maybe. Every rendered fact is one of these.
  shared        Chains, addresses, the four jobs, the SSRF guard, ABIs.
  index         Registry cohort walk, classification, template clustering, the funnel.
  probe         Endpoint probe, 402 parsing, ERC-8183 quotes, capability scan.
  counterfactual  The replay engine and its no-lookahead proof. The trial.
  rails         call · hire · mandate.
apps/web        Next 15, RSC-first.
apps/agents     Reference agents and the prove-* scripts.
worker          Indexer, prober, capability scanner, metrics, snapshot.
tools/checks    The gates.
```

---

## What is not true yet

Kept deliberately, because a README that only lists what works is a brochure.

- **No bond has been slashed on mainnet.** The contracts are deployed and
  verified there, and the full cycle is proven on testnet, but the mainnet
  deployment has never held collateral — this deployer holds no stablecoin on
  chain 56, so the first mainnet bond is still to come.
- **The market interface does not exist.** The current site is the previous
  directory, not the floor described above. It is being rebuilt.
- **The trial covers one job.** The replay engine handles LP rebalancing. Grid,
  yield and health-factor engines are specified and not built.
- **Rail 2 is proven on testnet, not mainnet**, and no deliverable has been
  submitted or settled by a counterparty.
- **The KeyStore registration has never landed.** The search now looks at the
  KeyStore and its controller rather than only the account, and the registry's
  own receipt is used when no log is found — but no live grant has confirmed it.
- **The reference agents are not funded** on their own mainnet wallets.
- **Quotes from this deployment are unsigned in production.** No seller key is
  deployed, so `negotiate` returns `signed: false` with the reason.

---

Built on BNB Chain.
