# mandate-verify

Re-derives a MANDATE settlement from public BNB Smart Chain state and checks it
against what was settled.

```bash
npx mandate-verify --mandate 0 --chain 56
```

| Exit | Meaning |
|---:|---|
| `0` | every check passed |
| `1` | a real mismatch — the settled numbers disagree with the committed ones |
| `3` | **inconclusive** — no node would serve the evidence |

The third one matters. Most public BSC endpoints refuse `eth_getLogs` over any
real range, and which ones refuse *changes*: `publicnode` served these queries
happily and now answers `Archive requests require a personal token` for
anything a few hours old. An earlier build swallowed that refusal and reported
a perfectly sound mainnet mandate as **FAILED**.

So this tries a list of endpoints, and a window that every one of them refuses
is recorded as a gap rather than as an empty result. A missing log and an
unreadable log are not the same claim, and only one of them is about the
mandate.

---

## Why this package exists separately

MANDATE slashes agents for underperformance. The number that decides each slash
used to live in a JSON file on the operator's laptop — an unverifiable
assertion, inside a product built to punish unverifiable assertions.

It now lives on chain: every measurement is committed with `award()` and
`settleEpoch()` before the outcome is known, and emitted whole in an `Observed`
log so the preimage is public.

This package is the other half of that fix. **It reads nothing but the chain** —
no database, no API, no environment variable, no file the operator controls. A
verifier that asked us for the answer would be checking our arithmetic against
our arithmetic, so the constraint is enforced rather than promised:

```bash
npm run check:isolation
#   ✓ isolated: 2 files, 1 dependency (viem), no filesystem, no environment,
#     no operator host
```

`scripts/check-isolation.mjs` fails the build if any file in `src/` imports
outside this package, reads `process.env`, touches the filesystem, contacts a
host that is not a public BSC node, or if `package.json` grows a dependency
other than `viem`. It runs on `prebuild`, so a violation cannot ship.

---

## What it checks

For the opening mark and for every settled epoch:

- the preimage is present in an `Observed` log
- it hashes to the commitment in contract storage, using the struct definition
  rather than the contract's own `hashObservation` — a contract that hashed
  inconsistently would be caught, not mirrored
- the committed value and block match what storage holds
- **the settled alpha is exactly what the two consecutive marks imply**,
  recomputed in independent integer arithmetic
- where the node still serves it, the valuation is re-read from balances and
  pool `slot0` at the pinned block and compared

## Tiers

Verification states how far it actually got, rather than claiming a level it
did not reach.

| Tier | What was checked | Needs |
|---|---|---|
| **1 — Integrity** | The measurements hash to commitments made before the outcome was known, and the settled alpha is the one they imply. | nothing |
| **2 — Re-derivation** | The valuation was independently recomputed from chain state at the pinned block. | a node still serving that block |
| **3 — Historical** | The same, at any depth. | `--archive <url>` |

The reported tier is the weakest any settled epoch reached.

### How far back public nodes actually serve state

Measured on 2026-09-04 by bisecting `eth_getBalance` depth on each endpoint,
with the elapsed time taken from the two block headers rather than converted
from an assumed block time — BSC blocks are **0.45 s**, and assuming 0.75 s
overstates the window by two thirds:

| Endpoint | State depth | Elapsed |
|---|---:|---:|
| `bsc.blockrazor.xyz` | 124 blocks | 56 s |
| `bsc-dataseed1.binance.org` | 122 blocks | 55 s |
| `1rpc.io/bnb` | 109 blocks | 49 s |
| `bsc-rpc.publicnode.com` | 95 blocks | 43 s |
| `bsc.meowrpc.com`, `bsc.drpc.org` | — | rate limited before answering |

So tier 2 is reachable for **roughly 45 seconds** after an epoch settles, and
tier 3 needs an archive node. Depth drifts between probes — `1rpc.io` returned
15 blocks on an earlier run — so treat the window as tens of seconds, not a
guarantee. This is a property of free BSC infrastructure rather than of the
design: the commitments are permanent either way, which is why tier 1 is the
floor and not the ceiling.

---

## Verified on mainnet

Market `0xeD331c44183EFF1e8eDc31f6C60AfDA187681544`, mandate 0, an agent holding
0.00015 BNB against a 0.00008 BNB bond.

Settling epoch 1 and verifying in the same breath, inside the state window:

```
  epoch 1  +0.00% against epoch 0  ·  tier 2
    ✓ attestation stored                        310045900000000 wei at block 119924716
    ✓ preimage in the logs                      wallet 0xd6d11Aa5…94cBe9
    ✓ settlement event found                    EpochSettled reported 0 bps
    ✓ hash matches its commitment               0xb142ab4d77db279d… vs 0xb142ab4d77db279d…
    ✓ value matches its commitment              310045900000000 wei vs 310045900000000 stored
    ✓ block matches its commitment              block 119924716 vs 119924716 stored
    ✓ settled alpha matches the marks           0 bps, re-derived independently from epoch 0
    ✓ valuation re-derived from chain state     310045900000000 wei read back at block 119924716
```

The last line is the one that matters: a process with no access to our
filesystem, database or API read BSC at the block the measurement was pinned to
and arrived at the identical figure, to the wei.

Reproduce it:

```bash
npm run settle -- settle 0                # in the application, settles the next epoch
npx mandate-verify --mandate 0 --chain 56 # within ~45 seconds, for tier 2
```

Epoch 0 settled earlier and now reports tier 1: its block is past every free
node's pruning depth, and the tool says so rather than quietly downgrading.

## Proving the checks bind

A verifier that never rejects anything is a rubber stamp.

```bash
npx mandate-verify --mandate 0 --chain 56 --tamper
```

takes each committed number in turn, moves it by the smallest amount that
matters, and confirms the check fails. Nothing is written anywhere; the
perturbation is local to the process.

```
  tamper test  each committed number, perturbed, must be rejected

    ✓ opening valuation +1 wei          hash no longer matches the commitment
    ✓ opening block +1                  hash no longer matches the commitment
    ✓ opening wallet swapped            hash no longer matches the commitment
    ✓ opening pool price +1             hash no longer matches the commitment
    ✓ epoch 0 valuation +1 wei          hash no longer matches the commitment
    ✓ epoch 0 gas spent zeroed          hash no longer matches the commitment
    ✓ epoch 0 alpha inflated by 1.00%   100 bps contradicts the 0 bps the marks imply

  7/7 rejected
```

## Options

```
  --mandate, -m <n>   mandate id to verify            (required)
  --chain, -c <id>    56 mainnet (default), 97 testnet
  --market <address>  market contract; defaults to the known deployment
  --rpc <url>         node to read from
  --archive <url>     node serving historical state, for tier 3
  --tamper            perturb each committed number and show it is rejected
  --json              machine-readable output
```

## Use it as a library

```ts
import { verifyMandate, hashObservation, alphaFrom } from "mandate-verify";

const r = await verifyMandate({ mandateId: 0, chainId: 56 });
if (!r.ok) throw new Error(r.failures.join("\n"));
console.log(`tier ${r.tier}`);
```

MIT.
