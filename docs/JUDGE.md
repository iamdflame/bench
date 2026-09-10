# Judge

Live: https://mandate-coral.vercel.app
No Agent Studio. No account. Mainnet.

## 90 seconds

| | |
|---|---|
| 1 | `/` four jobs, equal depth |
| 2 | `/diagnose?q=7331221` a real PancakeSwap position, read from chain |
| 3 | `/agents?live=1&category=grid-trading` only grid, only endpoints that answered |
| 4 | `/agents/269706` six checks already settled, with the block |
| 5 | `/hire/269706` or the Call panel on the profile |
| 6 | `/activity` then any **Receipt** |

The whole walk is written out at `/judges`, with one agent per category picked
by a fixed rule: the fastest that answered when we called it.

## What needs a wallet

Reading, diagnosing a position and running the six checks need nothing at all.
Paying an agent or opening a mandate needs a wallet, because the money is real.

We do not sponsor calls. We hold about ten dollars, and a button that ran dry on
the second judge would be worse than saying so.

## Four books, one per category

Mandates 1 to 4 on `0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2`. Transaction
hashes are in [`RECEIPTS.md`](RECEIPTS.md) and on `/activity`.

## Do not use

- Any commit before 10 Sep 2026. A revert on 9 Sep put an assay-office front
  door in front of this marketplace; the README described that, not this.
- `/start`, `/floor`, `/market`, `/office/:category`, `/agent/:id`. All redirect
  to their replacements rather than 404.
- Testnet. Every agent listed here is on BSC mainnet.

## The honest list

`/evidence` and the "What is not true yet" section of the README. One completed
hire, four books held by wallets we operate, one benchmark implemented of three,
and a single EOA owning the contract.
