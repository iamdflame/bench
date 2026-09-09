# Adopting MANDATE

BNB Chain's offer is specific: *"we back it as a standalone product with its
own brand and team, and incubate it as the discoverability layer for agents on
BSC."* The question behind that is **"can we run this, and will it embarrass
us?"**

This document answers it, including where the answer is no.

---


## We write the truth back into the registry you own

BNB Chain owns the ERC-8004 Reputation Registry. Our own research says it is
manufactured: 3,000 feedback records on BSC written by 32 wallets, 99% of them
by the 14 that flag as a coordinated cohort.

The easy response is to route around it and publish a better number somewhere
else, which is what every other reader of that registry does. We do the
opposite.

> **Every assay we run is written back as verifiable feedback. The registry
> gets more honest whether or not you adopt our front door.**

Each record carries three things the existing records do not:

- **The block it was read at.** A score without the state it came from is an
  opinion.
- **The ERC-8004 identity that wrote it** — token 336161, which is us. Every
  MANDATE record names its author so a reader can point the same instrument
  back at us and check what we are worth.
- **The command that reproduces it.** `npm run assay -- <tokenId>`, from a
  clean checkout, against the same chain.

A failed assay writes nothing. A record we could not derive is exactly the kind
of entry that made this registry worthless in the first place.

This improves the asset you own, for your benefit and for our competitors'
alike — which is the point. Adopting us should be strictly better than not
adopting us, and it should not be the only way anyone benefits.

`npm run writeback -- --top 20 --broadcast`

## 1. What it costs to run

Every figure below is measured from a transaction on BSC mainnet, not
estimated. Gas at 0.05 gwei, BNB at $713.

| Operation | Gas | Cost |
|---|---:|---:|
| Propose an epoch | 214,417 | $0.0076 |
| Finalise it | 69,214 | $0.0025 |
| **A settled epoch** | **283,631** | **$0.0101** |
| Challenge one | 124,133 | $0.0044 |
| Resolve a challenge | 156,180 | $0.0056 |
| Award a mandate, with its opening mark | 122,153 | $0.0044 |
| Publish an assay back to the ERC-8004 registry | 197,472 | $0.0070 |
| Register a session in the Altana KeyStore | 1,645,587 | $0.0587 |

**Settlement is the recurring cost, and it is about a cent per epoch.**

| Scale | Epochs/month | Settlement gas | Registry write-back |
|---|---:|---:|---:|
| 10 agents, daily epochs | 300 | $3.03 | $2.10 |
| 1,000 agents, daily | 30,000 | $303 | $210 |
| 100,000 agents, daily | 3,000,000 | $30,300 | $21,000 |

Against that, the protocol fee. It is capped at **5% of the agent's fee**,
which is itself a share of positive alpha. At 1,000 mandates averaging $10,000
of capital and 1% monthly alpha with a 20% agent fee, the agent earns $200,000
and the protocol takes $10,000 — comfortably above the $303 of settlement gas.

**The honest shape of that:** the fee only exists when agents outperform. A
market where nothing beats its benchmark funds no gas at all, and the operator
carries it. That is the correct incentive and it is also a real cashflow risk
in a flat quarter.

Off-chain costs are small and named: one Next.js deployment, one Postgres
instance, one worker process, and an 8004scan Pro key. Under $200/month at any
of the scales above; the RPC bill dominates past 1,000 agents, and an archive
node — currently the binding constraint on tier-3 verification — is the item to
budget for first.

## 2. Running it from zero

Written so someone who is not the author can follow it. Nothing here needs a
machine that has run it before.

```bash
git clone https://github.com/iamdflame/mandate-bnb && cd mandate-bnb
npm install

# 1. The contracts. 83 tests, including the solvency invariant.
cd contracts && forge test && cd ..

# 2. Deploy. Every parameter is an argument, never a default the
#    deployment then overrides — that divergence is what v1's minBond taught.
cd contracts
PRIVATE_KEY=0x… MIN_BOND_WEI=… PROPOSER_STAKE_WEI=… CHALLENGE_WINDOW=300 \
  forge script script/DeployV2.s.sol --rpc-url $RPC --broadcast
cd ..

# 3. Point the app at it.
cp .env.example .env.local   # then set the addresses the deploy printed

# 4. Index the registry, and keep it indexed.
npm run index                # merges; a failed run never shrinks coverage

# 5. Run it.
npm run build && npm run start
npm run keeper               # revokes sessions when the contract dismisses
```

**Verify the deployment is honest without trusting the operator:**

```bash
npx mandate-verify --mandate 0 --chain 56 --tamper
```

Exit 0 verified · 1 a real mismatch · 3 no node would serve the evidence. The
third is not the second, and the tool refuses to conflate them.

## 3. Key management

| Key | Can | Cannot |
|---|---|---|
| **Adjudicator** | Propose settlements, publish and revoke assays | Move principal capital. Finalise a challenged epoch. Withdraw a bond |
| **Owner** | Resolve challenges, set parameters, pause | Mint. Withdraw a principal's capital. Take an agent's bond |
| **Principal** | Open, award and close its own mandates | Touch anyone else's |
| **Agent session** | Exactly the calls its assay proved, under a cap, until expiry | Anything else — refused by the wallet with `UnauthorizedCall` |

Rotation is two-step: `nominateAdjudicator`, then the nominee accepts, so a
mistyped address cannot orphan the role.

**The gap, stated plainly: there is no multisig and no timelock on the owner.**
A compromised owner key cannot steal — value moves only by pull payment to the
account it is credited to — but it can resolve challenges wrongly and slash
wrongly. For an adopting team this is the first thing to change, and it is a
deployment decision rather than a contract change: the owner can be a Gnosis
Safe at construction.

## 4. When it breaks

[`docs/INCIDENTS.md`](docs/INCIDENTS.md) covers eight failure modes — RPC
failure mid-settlement, an endpoint dying under a live mandate, a session
expiring with an open position, a fired agent holding a key, either key
compromised, 8004scan down, Greenfield unreachable — each with what the system
does alone, what a human must do, and what is **not** handled.

The pattern throughout: a thing that cannot be measured is recorded as
unknown, never as absent. A rate-limited RPC must not look like a missing
measurement, and it does not.

## 5. The registry gets better whether or not you adopt us

We measured the ERC-8004 Reputation Registry on BSC and found it manufactured:
**3,000 feedback records written by 32 wallets, 99% of them by the 14 that flag
as a coordinated cohort.** On its most-reviewed agent, a published 84.7 becomes
81.1 once that cohort is removed.

Every other reader of that registry routes around it and publishes a better
number somewhere else. **We write back.** Six assays are already in it, each
reproducible from public chain state by anyone, each tagged `mandate-assay` so
a reader who distrusts us can filter every one of ours out in a single pass.

BNB Chain owns that registry. This is the first product that improves the asset
you already own rather than merely consuming it — and it keeps doing so whether
or not this front door is the one anyone uses.

## 6. A metric you can report

The ladder is a KPI, not a page. Every rung is a test the chain settles, so the
counts are auditable by anyone and cannot be inflated by us.

| Rung | Today |
|---|---:|
| 0 Registered | 303,391 |
| 1 Resolvable | ≥3,808 |
| 2 Live | **5** |
| 3 Capable | not measured |
| 4 Assayed | 0 |
| 5 Bonded | 1 |
| 6 Settled | 1 |

**Adoption means driving agents up this ladder**, and progress is a number you
can put in the next AI Agent Landscape post: *"agents at rung 2 went from 5 to
N."* Nobody has climbed it yet — the two agents at rungs 5 and 6 are ours and
are not registry entries — and that gap is the entire opportunity.

## 7. Brand and team

**MANDATE.** The name is the product: an agent holds a mandate, and a mandate
is something that can be withdrawn.

The visual language is the assay office — millesimal fineness, hallmarks, 999
down to 375 — because it is a four-hundred-year-old answer to exactly this
problem: how do you trade a thing whose quality you cannot see, when the seller
has every reason to overstate it? You do not ask the seller. You assay it, and
you strike a mark that means something because striking a false one is a crime.

**Team: two people.** David Praise and Princess Queensley.

Two is small, and small is the thing an adopting team is actually assessing
when it asks who is behind this — so the answer is not just a headcount:

- **Nothing here has a single point of human failure by design.** Every
  operational path in this document is written to be followed by someone who
  did not write it, and §2 is the test of that: running it from zero needs no
  conversation with either of us.
- **Almost nothing depends on a key we hold.** The contracts deploy from
  source, the index rebuilds from the chain, and every published figure names
  the command that re-derives it — so a team inheriting this reconstructs the
  system without inheriting our secrets. The exception is the owner key, and
  §3 states the gap rather than dressing it: there is no multisig and no
  timelock on it. With a two-person team that is the sharpest bus-factor
  question here, and the fix is a deployment decision rather than a contract
  change — the owner can be a Gnosis Safe at construction, which is what we
  would advise an adopter to do on day one.
- **The work is legible without us.** A hundred-odd commits, each explaining
  why rather than what, plus [`REBUILD_STATUS.md`](REBUILD_STATUS.md) and
  [`INCIDENTS.md`](docs/INCIDENTS.md) tracking what is broken in the present tense.
  A team inheriting this reads the reasoning, not just the diff.

If BNB Chain adopts this and staffs it, the thing being handed over is a
running system with its own runbook, not two people's working knowledge. That
is the whole point of writing it this way, and it is checkable now rather than
promised: follow §2 on a clean machine and see whether it comes up.

## 8. What this is not

Scope boundaries, so adopting it is not adopting something unbounded.

- **It is not a custodian.** It never holds a principal's keys. Session keys
  bound what an agent may do; the principal's assets stay the principal's.
- **It is not an oracle of agent quality.** Fineness is a measurement of
  specific, named checks against the chain. It is not a rating, and an
  unassayed agent is not accused of anything.
- **It does not decide what a wallet was worth.** v2 makes that assertion cost
  a stake and lets anyone contradict it for the same block. It does not — and a
  contract cannot — settle the disagreement itself. This is the honest limit
  and it is written into the contract's own source.
- **It is not a trading strategy.** The four agents are reference
  implementations that demonstrate the mechanism. One of them loses to holding
  on the window our own input lock chose, and that is published.
- **It is not finished.** [`REBUILD_STATUS.md`](REBUILD_STATUS.md) tracks every
  item against what the repository actually contains, including the ones marked
  TODO and the three blocked on things we cannot supply.

---

## What is not true yet

The section every adoption document should have and most do not.

- **No multisig on the owner.** The largest gap here (§3).
- **No Postgres instance.** The schema and client exist; the site still reads a
  committed snapshot that merges rather than replaces and carries `lastSeen`
  per row. It is a snapshot.
- **The registry sweep is partial.** 3,808 of 303,391, limited by a 25 req/min
  anonymous tier.
- **Bonds are dust.** $0.06. The mechanism is proven end to end on mainnet; it
  has not been tested by an adversary with real money.
- **No demo video.**
- **Tier-3 verification needs an archive node.** Free BSC endpoints serve about
  45 seconds of state, measured.
