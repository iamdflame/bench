# BENCH

**Hire an agent to run your money on BNB Chain.**
Choose how much it can do. Watch it work. Take it back anytime.

**Live: https://bench-six-sigma.vercel.app**

This file describes what the deployed site does today, in the present tense.
Every link in it is checked by CI (`npm run check:routes`), so a route named
here is a route that exists, and `npm run smoke` checks them against the
deployment rather than the source.

---

## The idea

Three ways to put an agent to work, in ascending order of what you give up.
The choice is the product's spine, and it is the first control on the hire
screen rather than an implementation detail.

| | **Call it** | **Hire it** | **Mandate it** |
|---|---|---|---|
| You give | A payment. Nothing else. | An escrow it can only open by delivering. | Standing authority over one position. |
| It holds | No key, no funds of yours | No key. The money sits in a contract. | A session key: capped, expiring, revocable. |
| Standard | x402 / B402 | ERC-8183 job escrow | Altana session + `RecipientBound` |
| Typical price | $0.01 | $0.10–$5 | a fee on what it earns |
| If it fails | You are out a cent | Reclaim the escrow after the deadline | Revoke; the cap bounds the blast radius |

Nobody hands a stranger a key. On the middle rail they get an escrow they can
only open by doing the work, which is how this marketplace hires agents it does
not operate.

## What it actually does

Every listing is called before it is listed. A registration with an endpoint is
a claim; a row on this board is an endpoint that answered a call we made, with
a challenge we could pay on this chain. Rows that fail stay listed with the
condition that failed, because a row you searched for and found unhireable has
told you something true.

Four sources fill it: the ERC-8004 identity registry read directly from the
chain, Binance's B402 Bazaar of paid endpoints, 8004scan for enrichment, and
our own probe.

## What we measured

**A paid call to an agent we do not operate.** 0.01 USD1, on BNB Smart Chain
mainnet, settled in
[`0x2e39837b…aae83ca`](https://bscscan.com/tx/0x2e39837b6302da0330ad004db136ab27c90b55f4f35fc89557678df61aae83ca)
at block 120,590,203. The buyer signed an EIP-3009 authorization and sent no
transaction, so it spent no BNB — the seller's facilitator submitted the
transfer. Six assertions, six proven.

```bash
npm run prove-call
```

**A session that could do four things, could not do anything else, and stopped
when it was revoked.** Rail 3, on mainnet. BENCH read what the chain shows a
wallet actually doing at PancakeSwap V3, granted a session scoped to exactly
that — four calls allowed, eight withheld, capped at 0.001 BNB, expiring in
fifteen minutes — and then attacked it. An in-scope selector was permitted and
failed at the target. An out-of-scope target was refused by the account itself,
naming the target and the four bytes: `UnauthorizedCall { target:
0xfd36e2c2…, data: 0xb0772d0b }`. A deliberately withheld selector was refused
the same way. Revocation landed in
[`0xbbeb10c6…d325b087`](https://bscscan.com/tx/0xbbeb10c6eb6d1d3d5d3de2cdc5da068007b1f5abf2608275f310df2ed325b087),
after which the relay reports the key as unknown. **Nine proven, none failed,
one inconclusive** — the KeyStore registration, which is reported as unproven
rather than rounded up.

```bash
npm run prove-scope -- --job rebalancing --wallet 0xcccd447e00fa38a288a8b6c29de52385a8342582
```

**An escrow funded against an agent we do not operate.** Rail 2, on testnet.
Five intents, simulated before anything was signed, then sent: job 1139 exists
on the ERC-8183 kernel carrying the quoted terms character for character, one
$U left the buyer and sits in the escrow contract, and the kernel reports
`FUNDED`. The dispute window is read from the policy the network actually uses
— 900 seconds — not from a constant here. Reclaim is one `claimRefund` call the
buyer makes from their own wallet. **Seven proven, none failed, one
inconclusive**: reclaim is not attempted, because sending a call to watch it
revert on a deadline we already read would be theatre.

```bash
npm run prove-hire
```

**Binance's B402 Bazaar lists 979 paid endpoints for BNB Chain. Four of them
can be paid on BNB Chain.** Every resource in the catalogue was called and its
live 402 parsed: 941 answered a well-formed challenge asking for payment on
chain 8453 in Base USDC, while their listing advertises chain 56. Four answered
a challenge payable here in USD1. Fifteen answered 404, fourteen timed out,
five answered without a challenge.

The listing is the merchant's claim; the challenge is the fact. It is why a
B402 row here opens the Call rail only after our own call gets a challenge we
could settle, and why most of the catalogue shows a refusal instead of a
button.

**Neither BSC USDT nor BSC USDC implements EIP-3009**, so neither can settle an
x402 `exact` payment — read directly from both contracts, both reverting on
`authorizationState` and `DOMAIN_SEPARATOR`. USD1 and $U answer both. All four
revert on `version()`, so a client that trusts a challenge's `extra.version`
rather than reading the token signs against the wrong EIP-712 domain.

Every figure above is reproduced by [`/data`](/data), which carries the command
beside each one.

**What three agents would have done to a position, replayed against the pool's
own history.** `packages/counterfactual` walks a PancakeSwap V3 pool's `Swap`
events into a price series, then drives each strategy across it one observation
at a time — fees computed from the trades that actually happened, gas at the
chain's own price, slippage bounded by the pool's depth at that block.

The published run — 18,911 swaps over 24 hours of WBNB/USDT, every range served
— is on [`/data`](/data) with its method and a command that reproduces it:

| | in range | recentres | net | vs doing nothing |
|---|---|---|---|---|
| Hold | 29.5% | 0 | +0.52 | — |
| Range Keeper I | 100% | 1 | +10.40 | **+9.88** |
| Range Keeper II | 100% | 1 | +14.53 | **+14.01** |
| Tight Band Keeper | 100% | 9 | −6.28 | **−6.80** |

Tight Band Keeper holds the price in range as well as anything above it and
still finishes behind doing nothing, across nine recentres. Time in range is not
money, and that row is what makes the other two worth reading.

**It is one window, not a track record.** The same replay eight minutes earlier
had every strategy losing. The page says so itself, because publishing a single
replay as a forecast would be a brochure wearing arithmetic.

```bash
npm run counterfactual -- --days 1 --half 60
```

**And for a position you actually hold.** Open any agent and paste the address
that holds it — `/a/56/<id>?position=0x…`. It reads your PancakeSwap V3
positions off chain, takes the largest, and replays every strategy against that
band, that liquidity and that pool's real swaps.

Reading a position needs an address; only *acting* needs a signature. So it is a
plain form, it works with JavaScript off, and it adds nothing to the bundle.
Nothing on that page can move anything you own.

The first real position it was pointed at — a 3,200-tick band on a 1% pool,
against 1,971 swaps:

| | in range | recentres | vs holding |
|---|---|---|---|
| Hold | 66.8% | 0 | — |
| Range Keeper I | 97.6% | 8 | −114.65 |
| Range Keeper II | 95.3% | 31 | −268.90 |
| Tight Band Keeper | 93.6% | 125 | −644.07 |

Every one of them would have destroyed value on that position, and the page says
so: *"that is a real answer to 'should I hire one of these for this position',
and it is no."* A marketplace that cannot tell somebody not to buy is a shop.

A strategy is handed one observation and never the series, so it cannot read
ahead. `npm run check:no-lookahead` proves it: corrupt every tick after a cut,
replay, and fail if any earlier decision moved. A test builds a strategy that
cheats anyway — a closure over the series — and asserts the check catches it.

## The rooms

| Route | What it is |
|---|---|
| [`/`](/) | The board. Every listing, four job doors, three rail filters. No wallet. |
| `/j/[job]` | One job's board: rebalancing, grid, yield, health. One template, four jobs. |
| `/a/[chain]/[id]` | One agent: what it claims, what the chain shows, every check we ran. |
| `/hire/[chain]/[id]` | The engagement. May and may-not, custody, signatures — before the button. |
| [`/desk`](/desk) | What has been put to work, and how to end it. |
| [`/register`](/register) | Everything read, searchable by token id or address. |
| [`/data`](/data) | Where every number comes from, and what could not be measured. |
| [`/list`](/list) | List your agent. Paste an id or a URL; it is called live. |

Machine surfaces, not navigation: `/api/v1/*` (open, unauthenticated,
CORS-open, rate-limited) and `/api/mcp` (five tools, so an agent can browse and
plan a hire from an editor).

## Rules this holds itself to

Each of these is enforced by something in `tools/checks`, because a rule in a
README is a sentence somebody contradicts in six months with a one-line change
nobody reviews carefully.

| Rule | Gate |
|---|---|
| Our agents never outrank a better-measured third party | `check:ranking` — builds a better third party and fails if ours sorts first; also reads the sort function for any ownership term |
| An unknown is never a zero, a blank or a dash | `check:absence` |
| Every figure carries its block and its method | `check:measurement` |
| Chain 56 and 97 never appear in one figure | `check:network` |
| The four jobs are equal in depth | `check:diversity` |
| No link goes to a dead end | `check:routes` |
| A strategy cannot see past its own block | `check:no-lookahead` |
| Nothing animates without a data event, and no glassmorphism | `check:motion` |
| The homepage stays inside its JavaScript budget | `check:budget` |
| Every route, the funnel's freshness and all three rails, against something serving | `npm run smoke` |
| A log filter that is dropped rather than rejected | `packages/shared/src/__tests__/client.test.ts` asserts on the JSON-RPC body that leaves the process |

```bash
npm run check          # the static gates
npm run smoke          # against a running deployment
npm run contracts:test # 18 tests, incl. a 512-run fuzz on the cap invariant
```

## How it looks, and why

The design system is in `mainplan.md` §13 and lives entirely in
[`apps/web/app/globals.css`](apps/web/app/globals.css). Three things carry it.

**The ramp is the whole chromatic system.** Teal is *call it* — you give a
payment. Gold is *hire it* — you give an escrow. Ember is *mandate it* — you
give standing authority. Nothing else on the site is coloured, and the logotype
is those three bars ascending, so a reader who learns the mark has learned the
product. An open rail is lit, with a halo in its own colour; a closed one is
left as the rule it was drawn from. A refusal is `--color-refused`, never red.

**A figure is illuminated only when it is above zero.** A gold nought would be
the loudest thing on the page saying nothing is available, so a rail with
nothing open shows its real count in `--color-dim`. The figure is never hidden
and never rounded away — `check:absence` fails the build on a dash, a blank or a
defaulted zero, and it has caught this codebase doing exactly that.

**The band above the board departs from §12.1 on purpose.** The plan says "no
marketing hero — the inventory is the homepage". The hero
([`components/board/Hero.tsx`](apps/web/components/board/Hero.tsx)) is a
deliberate exception, and what makes it one is that every figure in it is read
from the chain this minute and every claim in it is a transaction on
[`/data`](https://bench-six-sigma.vercel.app/data). There is no slogan in it and
nothing that would still be true if the product did not work. It adds no client
JavaScript: the homepage first load is unchanged at 105.5 KB against a 117 KB
cap.

```bash
npm run build && npm run start          # then
node tools/shot.mjs http://127.0.0.1:3130 .shots   # every screen, 1440x900 and 360x780
```

## The one contract

[`contracts/src/RecipientBound.sol`](contracts/src/RecipientBound.sol)

A session key binds a target and four selector bytes. It cannot bind an
*argument*. PancakeSwap's position manager takes `recipient` as an argument on
`mint` and `collect`, so granting those selectors grants them with any
destination the agent picks — a real boundary, but not a binding.

So the session is not granted on the position manager. It is granted on this
wrapper, whose `mint` and `collect` have **no recipient parameter**: the
destination is written from immutable storage. There is nothing to pass,
because the argument is not in the interface. Four functions, no `multicall`,
no `sweepToken`, no upgrade path, no owner.

Nothing else is deployed. An escrow is what ERC-8183's kernel is for.

## Running it

```bash
npm install
npm run dev                     # http://localhost:3000

npm run sweep                   # read the registry from the chain, resumable
npm run bazaar                  # pull Binance's B402 catalogue
npm run probe -- --limit 999    # call everything we intend to list
npm run mandate                 # scan the chain for capability
npm run metrics                 # per-job track records
npm run snapshot                # rebuild and print the funnel

npm run worker                  # all of the above, every 15 minutes
```

The site runs from the committed board in `apps/web/data` without any of this.
That is deliberate: the front door of a marketplace must not go blank when a
third party's database is unhappy.

### Configuration

| Variable | Purpose |
|---|---|
| `BSC_RPC_URL` | Comma-separated read endpoints, primary first |
| `LOG_RPC_URL` | Extra hosts for ranged `eth_getLogs`, tried first. |
| `ARCHIVE_RPC_URL` | A host serving deep history. Optional: `bsc.rpc.blxrbdn.com` ships as the default and answers 208 days back, capped at 5,000 blocks a request. |
| `SCAN_API_KEY` | 8004scan, for enrichment only. The crawl does not depend on it. |
| `BUYER_KEY` | Funds the Call rail's float so a visitor can see it work without funding a wallet |
| `RECIPIENT_BOUND` | The deployed wrapper for a (principal, agent) pair. Absent means no wrapper, and the hire screen says so. |

## Layout

```
apps/web        Next 15, RSC-first. The eight rooms and the machine surfaces.
apps/agents     Reference agents and the prove-* scripts.
packages/
  measure       Measurement and Maybe. Every rendered fact is one of these.
  shared        Chains, addresses, the four jobs, the SSRF guard, ABIs.
  index         Registry sweep, 8004scan, B402 Bazaar, origin clustering.
  probe         Endpoint probe, 402 parsing, ERC-8183 quotes, capability scan.
  metrics       Wallet valuation and the per-job track records.
  rails         call · hire · mandate.
contracts       RecipientBound.sol and its tests. Nothing else.
worker          Indexer, prober, capability scanner, metrics, snapshot.
tools/checks    The gates above.
```

## What is not true yet

- **Rail 2 is proven on testnet, not on mainnet.** An escrow is funded and the
  terms are on chain, against a provider we do not operate. Mainnet's dispute
  window is seven days, read from the policy contract, so a mainnet job has to
  be funded early enough to settle inside the window somebody is watching.
- **No deliverable has been submitted or settled.** The buyer's half of Rail 2
  is exercised end to end; the seller's `submit` and the settle-or-dispute
  branch are not, because that needs a counterparty who wants the money.
- **The KeyStore registration does not land.** Rail 3's sessions enforce
  correctly either way — that is proven — but no `Authorize` log is found, so
  every engagement is recorded `registered: false`. Registration is what would
  let a counterparty verify a scope without asking us, and it is reported as
  unproven rather than quietly dropped.
- **The reference agents are not funded.** Their strategies and endpoints exist
  and their rows say `not funded on its own mainnet wallet yet` rather than
  showing a track record they have not earned.
- **The crawl is shallow.** It walks backwards from the head and the depth
  reached is stated on [`/data`](/data). Everything not yet read is neither
  listed nor counted as absent.
- **The desk shows only this deployment's own engagements**, because it holds
  no visitor's key. Reading a connected wallet's jobs and sessions is a wallet
  connection away and is not pretended at.

---

Built on BNB Chain.
