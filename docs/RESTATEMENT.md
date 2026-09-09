# Restatement

Every settled epoch this project has ever produced on BNB Smart Chain, re-run
through the corrected valuation engine.

Generated 2026-09-05T16:42:51.512Z · reader `https://bsc-dataseed.bnbchain.org` · archive **not available**

## What was wrong

`valueWallet()` read native BNB and USDT. That was the entire valuation. Every
strategy this market runs moves capital into something else — a PancakeSwap V3
position, a Venus supply, a debt repayment, a WBNB wrap — and all of it was
counted as zero. An agent that did exactly what it was hired to do was measured
as having destroyed the capital it deployed.

The effect is not theoretical. At the time of writing, the wallet that holds
mandates on the live market carries a Venus supply worth roughly 23% of its
total value, and the old gauge valued it at nothing.

## The slashes on record

3 slashes, totalling **0.00037000 BNB**.

| Market | Mandate | Epoch | Reported α | Slashed (BNB) | Resolved |
|---|---:|---:|---:|---:|---|
| pre-attestation | 2 | 0 | — | 0.00020000 | **no — still pending** |
| pre-attestation | 2 | 1 | — | 0.00015000 | **no — still pending** |
| superseded v2 | 1 | 0 | -5.68% | 0.00002000 | **no — still pending** |

Every one of these is against the same agent, and none has been resolved.
`resolveSlash(mandateId, epoch, false)` returns a pending slash to the agent,
and this project owns both contracts, so the remedy is executable the moment
the error is established.

## Re-derivation

9 settled epochs found. 0 re-derived. 9 could not be.

| Market | Mandate | Epoch | Block | Reported | Corrected | Status |
|---|---:|---:|---:|---:|---:|---|
| pre-attestation | 2 | 0 | — | — | — | this market predates attestations; nothing was committed to re-derive against |
| pre-attestation | 2 | 1 | — | — | — | this market predates attestations; nothing was committed to re-derive against |
| superseded v2 | 1 | 0 | 119980473 | -5.68% | — | no archive endpoint — pass --archive URL or set ARCHIVE_RPC_URL |
| superseded v2 | 1 | 1 | 119981313 | -1.82% | — | no archive endpoint — pass --archive URL or set ARCHIVE_RPC_URL |
| v1 (live) | 0 | 0 | 119923446 | +0.00% | — | no archive endpoint — pass --archive URL or set ARCHIVE_RPC_URL |
| v1 (live) | 0 | 1 | 119924716 | +0.00% | — | no archive endpoint — pass --archive URL or set ARCHIVE_RPC_URL |
| v1 (live) | 2 | 0 | 120058013 | +13.51% | — | no archive endpoint — pass --archive URL or set ARCHIVE_RPC_URL |
| v2 | 0 | 0 | 120056289 | -0.01% | — | no archive endpoint — pass --archive URL or set ARCHIVE_RPC_URL |
| v2 | 0 | 1 | 120057118 | -1.83% | — | no archive endpoint — pass --archive URL or set ARCHIVE_RPC_URL |

## What is not established

Re-deriving a valuation at a past block needs archive state. BSC's public
endpoints serve roughly fifty seconds of it: `bsc-dataseed` answers
`missing trie node`, `blockrazor` answers `not supported`, and `publicnode`
answers `Archive requests require a personal token`. The attested blocks are
hours old.

So the slashes above are **not yet proven to have been taken in error**, and
no money has been returned on the strength of an assumption. Correcting the
record with an unverified correction would repeat the exact failure this
document exists to report.

This completes itself the moment an archive endpoint is available:

```
npx tsx src/scripts/restate.ts --archive <archive-rpc-url>
```
