# Definition of done

Thirteen gates, each marked as it actually stands on 5 September 2026. The
verdicts are **passed**, **partial** or **not yet**; there is no fourth column
for "nearly", because a product whose thesis is that unverifiable claims are
worthless does not get to grade itself generously.

Every row carries the command or the transaction that settles it. Where a gate
is failed, the reason is stated in the present tense — a plan is not a pass.

| Gate | Verdict |
|---|---|
| Correct | **passed** |
| Manipulation-resistant | **passed** |
| Restated | **partial** |
| Verifiable | **partial** |
| Bonded | **not yet** |
| Self-subject | **passed** |
| Open | **partial** |
| Contributing | **passed** |
| Historical | **partial** |
| A marketplace | **partial** |
| Used | **not yet** |
| Real | **not yet** |
| Honest | **passed** |

Four passed, five partial, three not yet, one passed on a technicality it is
worth being suspicious of. The detail is below.

---

## Correct — passed

*Every strategy's assets and liabilities valued; all fork tests green; no
strategy measures negative for correct behaviour.*

The gauge reads native BNB, tracked ERC-20s, Uniswap/PancakeSwap V3 positions
(via tick maths verified against the reference implementation at both
extremes), Venus supply *and* borrow, and MasterChef stakes. Liabilities are
subtracted, so a health-factor agent that repays a debt no longer measures as
having destroyed value.

The composition refuses rather than approximates: if any adapter returns null,
the whole valuation is null. A wallet that cannot be fully seen is not valued
at all.

```
npm test                     61 passed
FORK_RPC_URL=... npm run test:fork
```

The fork tests are opt-in on an explicit `FORK_RPC_URL` rather than on
reachability, because a stale anvil left them failing for reasons that had
nothing to do with the code. They were last run green against a mainnet fork.

## Manipulation-resistant — passed

*TWAP settlement live; deviation guard refuses on a forked manipulation test.*

Settlement prices from a 1,800-second TWAP on the reference pool, never spot.
The guard refuses when execution and settlement prices diverge by more than 200
basis points, measured on price rather than on its square root — a distinction
worth a test of its own, since `sqrtPriceX96` makes the wrong version look
right.

`src/lib/chain/valuation/__tests__/settlement-price.test.ts` covers the window,
the average, the deviation the guard acts on, the basis-point arithmetic, the
boundary (refuses *above* the threshold, not *at* it), and the threshold's
value.

## Restated — partial

*`RESTATEMENT.md` published; erroneous slashes returned on-chain with tx
links.*

`docs/RESTATEMENT.md` is published. Three slashes totalling 0.00037 BNB stand
against `0xd6d1…cbe9`, all unresolved, and we own both contracts — returning
the money is one `resolveSlash` call away.

**It has not been made, and that is the finding.** Proving those slashes were
wrong means re-deriving the wallet's value at the block each was settled at,
and no provider available here still serves that state. Returning money on the
strength of a strong suspicion would be settling on an unverified claim, which
is the exact act this product exists to refuse. The refusal is published rather
than the correction.

Unblocked by an archive RPC (`ARCHIVE_RPC_URL`, declared and empty).

## Verifiable — partial

*`npx mandate-verify` runs from a clean machine against mainnet, exits 0.*

It does. Run from an empty directory with no repository present:

```
npx mandate-verify --mandate 0 --chain 56 --deployment v1   VERIFIED (tier 1)  exit 0
npx mandate-verify --mandate 2 --chain 56 --deployment v1   VERIFIED (tier 1)  exit 0
npx mandate-verify --mandate 0 --chain 56                   INCONCLUSIVE       exit 3
npx mandate-verify --mandate 7 --chain 56 --deployment v1   error: does not exist
```

The canonical deployment is the default and reports INCONCLUSIVE, not
VERIFIED: v2's settlement logs are not served by any public BSC provider, so
the tool says it could not get the evidence rather than that the mandate is
wrong. Every command printed on the site names `--deployment v1` for that
reason — the deployment whose epochs a public node will still show.

**The published version has a bug this gate found.** `mandate-verify@0.2.0` on
npm reports `FAILED` on mandates 1 and 3 — both of which are simply unawarded,
with no agent and therefore nothing that could have been committed. It read
that absence as its gravest finding.

The cost is not a wrong word on a terminal. The exit code is the whole product:
a CI job that greps for non-zero learns to ignore this one the first time it
fires on a healthy mandate, and then it will not be read on the day it is
right. Fixed in this repository, with a regression test that runs the real
verification path against a local node
(`packages/mandate-verify/src/verdict.test.ts`) and was confirmed to fail when
the fix is reverted.

**The fix is not on npm.** Publishing needs the maintainer's credentials, which
are not available in this environment. Until `npm publish` is run from
`packages/mandate-verify`, the version a judge installs is the version with the
bug, and this gate stays partial.

## Bonded — not yet

*Every hallmark ≥375 carries a live, challengeable bond.*

`contracts/src/AssayBond.sol` is written and tested — 15 tests including a fuzz
invariant on solvency, and three settlement paths: self-evident challenge,
adjudicated resolution, and silence losing by default.

It is **not deployed**. Deploying it escrows real BNB against every mark this
office strikes, which is the point of it and also why it is not a decision to
take unattended. No mark currently carries a bond, and `Claim.tsx` says so on
every claim that has none: *"No bond stands behind this yet."*

Read literally the gate is *satisfied* — every hallmark at or above 375 carries
a bond, and there are none, so the statement holds over an empty set. That is
not a pass and it is not recorded as one. A gate that passes because nothing
has happened yet is measuring nothing.

**No wallet carries a fineness on the current market at all.** Both
`fineness(0xd6d1…cbe9)` and `fineness(0x54c0…3C90)` return 0 on
`0xeD33…1544`. Fineness was written to an earlier deployment and never
re-written after the redeploy, which is also how the README came to caption its
own headline screenshot with a hallmark at 405 that the same image reported as
`0 HALLMARKED IN THIS VIEW`. Corrected there, and noted here.

## The canonical screenshot

§7 asks for `/agents` sorted by fineness showing two struck gold hallmarks and
eighteen blank rows. It shows **3,809 blank rows and no hallmarks**, because
nothing has earned one, and manufacturing a mark to make the image match its
brief would be the single most on-the-nose violation available to this project.

Shot from production at 1600×1000 and at 2× — `docs/screenshots/register.png`
and `register@2x.png`, via `npm run shots:canonical`. The empty column makes
the argument more forcefully than two gold marks would have.

## Self-subject — passed

*MANDATE registered, assayed by its own engine, listed at its earned rung.*

Registered in the ERC-8004 Identity Registry on BNB Smart Chain as token
**336161**, assayed by the same engine that assays everyone else, and listed at
the rung that produced — not at a rung chosen for it.

## Open — partial

*Public assay API live, documented, npm client published, competitors invited
by name.*

The API is live and documented at `/api`; `mandate-verify` is on npm; `/api`
carries an invitation to directories, routers and wallets on BNB Smart Chain to
use the assay, cite it, and disagree with it in public.

**The invitation does not name anyone.** The gate asks for competitors invited
by name and the page addresses a category instead, which is the easier and less
costly version of the same sentence.

## Contributing — passed

*Assays writing back to the ERC-8004 Reputation Registry.*

Assays are written back as verifiable feedback to the registry BNB Chain owns,
so the work improves the commons whether or not this front door is ever used.

Most recent: agent 2410, fineness 155 → score 16, *Base metal* —
[`0xadb242a3…0befd76`](https://bscscan.com/tx/0xadb242a33a330508b0700708cfd7b48ed9e824f202810222fd8e8cccf0befd76).

That write-back publishes a *failing* grade on a real agent, which is the only
version of this gate worth passing.

## Historical — partial

*`/agents?block=N` re-derives the ladder at any block.*

`src/lib/replay.ts` re-derives rungs 0, 5 and 6 from events at any block, and
the register accepts `?block=N`.

Rungs 1, 2 and 3 are marked `NEVER_ON_CHAIN` and always will be: whether an
agent card resolved, whether an endpoint answered, and whether a wallet had
touched its category's protocols are observations *we* made off-chain. There is
no honest way to re-derive them from history, so they are not re-derived — they
are labelled. Rung 4 needs archive state.

A slider that re-derived all seven rungs would be the more impressive demo and
three of its seven numbers would be invented.

## A marketplace — partial

*All 303,391 agents have a hire path or a stated reason they have none.*

Every agent above rung 2 has a hire path — the button, the register column and
the home call-to-action. Below rung 2 each row carries the specific reason it
has none: `endpoint 404s`, `agent_wallet == owner_address`, `nonce 0`, `card
unparseable`, `endpoint is an unsubstituted {agentId} template`.

**The register holds only the agents we have actually read** — 3,808 of
303,391. The rest have neither a hire path nor a stated reason, because
rendering rows for ids nobody has confirmed would manufacture exactly the kind
of claim this product refuses. Reaching all of them is rate-limited at the
index, not blocked.

## Used — not yet

*20+ distinct non-you wallets transacted on mainnet.*

No. The wallets that have transacted against the market are ours.

Worth stating separately: this could not be enumerated from logs either. Of the
three allowed providers, `bsc-dataseed1` refuses `eth_getLogs` over any range,
`publicnode` rejects the parameters, and `blxrbdn` returns an empty set for a
window known to contain a settlement. So the figure above is what we know from
having sent the transactions, not a count read back off the chain — and the
gate would fail on either reading.

## Real — not yet

*≥1 mandate settled at ≥1 BNB, published either way.*

Largest mandate settled: 0.0014 BNB. Two mandates verify at tier 1; the
mechanism is identical at any size and only the numbers on screen change.

**Standing constraint:** a real-size mandate needs roughly 1.25 BNB, which is
not available. This is not work in progress; it is a thing we do not have. It
is recorded here so that no part of the product implies otherwise.

## Honest — passed

*Zero silent PARTIALs; `/evidence` has a "What is not true yet" section.*

`/evidence` carries **What is not true yet**, in the present tense, on the same
page as the wins and in the same type. This document is the same instinct
applied to the gate list itself.

The strongest evidence for this row is the row above it, and the two before
that. A version of this table with thirteen passes would have been easy to
write and worth nothing.

---

## Read from production on 5 September 2026

Every claim below was checked against the deployed site rather than against
this repository, because the two had drifted and production is the one a judge
opens.

**The floor showed an empty market.** With JavaScript off it said "0 mandates
active", "0 opened all-time" and "Reading the chain…" beside ledgers on the
same site reading Active. Its "verify on BscScan" button linked
`bscscan.com/address/` with no address on it. Both fixed: the book is read on
the server across all three deployments and the first HTML carries eight
mandates, 0.00686 BNB under mandate and 0.00264 BNB bonded.

**Three contracts each called themselves the market.** The footer linked the
first deployment, `/start` printed the second, the README named the third, and
`mandate-verify` defaulted to a fourth answer. They are named now — v2
canonical, v1 and v0 superseded — in the site, the config and the verifier's
`--deployment` flag. All three still hold mandates with settled epochs,
including the grid mandate that lost 21%, and all three stay readable.

**The verifier could not read the contract we call canonical.** It reported
FAILED with a hash mismatch, which is the gravest thing it can say. Three
faults: v2's observation carries a seventh field so no v2 event ever matched
and no v2 preimage ever hashed correctly; epoch 0 has two Observed logs and the
scan kept whichever came last; and the log search stopped at the first
provider's answer, which on BSC is an empty array for ranges it silently
declines to serve. Underneath all three, absence was being read as a verdict.
Fixed, with `--tamper` still rejecting 8 of 8 perturbations.

**The four offices had no pages.** `/office/*` 404'd and the home page's four
doors led to a filtered register. Agent Diversity is a third of the main-track
score. Each office now has the same page — book, live-unbonded agents, venue,
benchmark, and the commands that reproduce every figure — and none of the four
is empty.

**Two mistakes I made and caught here rather than shipping.** The office pages
linked `/mandate/v1/2`, which did not exist; that one *was* deployed before it
was caught. And they asked for CSS classes that were never defined, so the book
rendered unstyled. `npm run check:doctrine` now fails on a class that does not
exist, which would have caught the second before it reached production.

## What would move the most, and what it costs

1. **`npm publish` from `packages/mandate-verify`** — needs the maintainer's
   npm credentials. Turns *Verifiable* from partial to passed and stops a judge
   installing a verifier that cries wolf.
2. **An archive RPC** — unblocks *Restated* (return the money, or prove we
   should not) and rung 4 of *Historical*.
3. **Deploy `AssayBond`** — escrows real BNB behind every mark. *Bonded*.
4. **~1.25 BNB** — *Real*. Standing constraint.
