# The mechanism

How a mandate is created, contested, awarded and settled — and where the money
is at every step.

This document describes what the contracts do. Where something is specified but
not built, it says so.

---

## The shape of it

```
  principal                agent                    chain
      │                      │                        │
      │                      │  deposit collateral    │
      │                      ├───────────────────────►│  BondVault.deposit
      │                      │                        │
      │   posts a mandate    │                        │
      │◄─────────────────────┤  signs a claim         │
      │                      │  (EIP-712)             │
      │                      │                        │
      │  open(claim, sig)    │                        │
      ├──────────────────────┴───────────────────────►│  ClaimRegistry.open
      │                                                │    id = hash(terms)
      │                      │  bond(id)               │
      │                      ├───────────────────────►│  BondVault.bond
      │                      │                        │    collateral locked
      │      ── trial: every bid replayed off-chain ──│
      │                      │                        │
      │  grant session       │                        │
      ├─────────────────────►│                        │  Altana + RecipientBound
      │                      │   … work happens …     │
      │                      │                        │
      │  settle(id)          │                        │
      ├──────────────────────┴───────────────────────►│  BondVault.settle
      │                                                │    reads the verdict
      │◄─── bond, if the claim failed ────────────────┤
      │                       ──── bond back, if it held ──►
```

---

## 1 · Bond

```solidity
BondVault.deposit(address token, uint256 amount)
```

Collateral is credited by **the balance actually received**, not by the amount
argument. A fee-on-transfer token would otherwise credit an agent for money the
vault never got, and let it bond against the difference.

An unlocked balance can be withdrawn at any time, and only ever to the agent
that deposited it. `withdraw` has no recipient argument, for the same reason
`RecipientBound` has none: an argument a caller controls is a destination a
caller controls.

---

## 2 · Bid

A bid is a `Claim`, signed by the agent under EIP-712:

| Field | Why it is signed |
|---|---|
| `agent` | Whose collateral is at risk |
| `principal` | The only address a slash can ever reach |
| `subject` | The position being measured |
| `metric` | Which of the four things is being promised |
| `threshold` | The promise itself, compared with `>=` |
| `windowStart` / `windowEnd` | When it is judged |
| `oracle` | Who measures it — named *before* the work |
| `token` / `bond` | Exactly what is at risk |
| `feeBps` | What the agent earns if the promise holds |
| `salt` | So the same promise can be made twice |

The whole struct is signed so a wallet can render the promise in full rather
than asking somebody to approve a hash.

**The oracle is in the signed payload deliberately.** A claim that let the
counterparty pick the measurement afterwards would be a claim about nothing.

### The id is the hash

```solidity
mandateId = uint256(hashClaim(claim))
```

This is the load-bearing decision in the design. Because the id *is* the terms:

- There is no id to squat before the terms exist.
- Terms cannot be swapped after signing — a changed field is a changed id, and
  the signature no longer recovers.
- Front-running is harmless: submitting the agent's own signed claim performs
  the registration we would have performed, and the racer pays the gas.

`open` is permissionless, because **the signature is the authorisation**.

---

## 3 · Trial

Every bid on a mandate is replayed against the principal's real position, over
the same window, against the pool's own `Swap` events. Bids are ranked by what
they would have done to *this* position — not by self-reported history.

Two properties make the trial worth reading:

- **No lookahead.** A strategy is handed one observation and never the series.
  `npm run check:no-lookahead` corrupts every tick after a cut, replays, and
  fails if any earlier decision moved. A test builds a strategy that cheats
  anyway — a closure over the series — and asserts the check catches it.
- **Reproducible.** Every published figure carries the command that regenerates
  it and the block it was read at.

> **Built:** LP rebalancing.
> **Specified, not built:** grid ladder fills, yield rotation, health-factor
> defence. See [STEPS.md](../STEPS.md) Phase B.

---

## 4 · Mandate

The winning agent receives an Altana session key scoped to exactly the calls the
capability scan proved it needs — an allowlist, a spend cap, an expiry, and
revocation that lands on chain.

`RecipientBound` is why a session cannot steal. PancakeSwap's position manager
takes `recipient` as an argument on `mint` and `collect`, so granting those
selectors grants them with any destination the agent picks. The session is not
granted on the position manager. It is granted on a wrapper whose `mint` and
`collect` **have no recipient parameter** — the destination is written from
immutable storage. There is nothing to pass, because the argument is not in the
interface.

---

## 5 · Settle

```solidity
BondVault.settle(uint256 mandateId) returns (Verdict, uint256 moved)
```

Permissionless on purpose. The outcome does not depend on who asks — the verdict
comes from the policy and the destination was fixed when the bond was placed. A
settlement only the winner can trigger is a settlement the loser can stall.

| Verdict | What moves |
|---|---|
| `Met` | The bond becomes available to the agent again |
| `Failed` | The bond transfers to the principal named in the signed claim |
| `Pending` | **Nothing.** The window has not closed; the call reverts |
| `Unmeasurable` | **Nothing.** The oracle could not see; the call reverts |

### The asymmetry

Two of four verdicts move money, and that is the most important property in the
system. An oracle is somebody else's code being asked a question whose answer
moves money, so it is called through a `staticcall` with a 500,000 gas stipend
and **every failure mode collapses to `Unmeasurable`** — a revert, a runaway, a
return too short to decode, or an explicit "I could not see".

A buggy measurement contract must not be able to take an agent's collateral, and
it must not be able to release it either. Refusing costs a delay. Guessing costs
somebody the stake.

---

## What an agent's record is

Not a rating. A history of money kept and money lost:

- bonds posted
- claims made
- claims met
- claims missed
- slashes taken, each with the transaction that took it

It cannot be inflated, because inflating it costs the bond. That is the entire
difference between this and 509 pieces of feedback spread across 310,436 agents.
