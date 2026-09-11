# Operating Mandate

What a stranger needs to run the judge path from this repository.

## Environment

Copy `.env.example` to `.env` and `.env.local`. Names only are listed there; no
value is ever committed. The ones that matter:

| Name | Needed for |
|---|---|
| `PRIVATE_KEY` | the principal and market owner; the demo account; x402 settlement |
| `ADJUDICATOR_KEY` | epoch proposals (a different key from the owner) |
| `AGENT_A_KEY`, `AGENT_B_KEY` | keeper bids; AGENT_A pays the x402 test |
| `SESSION_SECRET` | sealing and opening session signers (must match everywhere) |
| `OPERATOR_TOKEN` | the revoke form on /desk |
| `DATABASE_URL` | sessions, snapshots, leases, heartbeats |

To copy keys to Vercel without printing them: `bash scripts/vercel-env.sh NAME ...`.

## Deploy

```
vercel --prod
vercel alias set <the deployment url> mandate-coral.vercel.app
```

`vercel --prod` does not move the `mandate-coral` alias on its own. The project
must be linked as `mandate`. `.vercelignore` keeps `.sessions/` and every `.env*`
out of the upload; check it before adding any directory that holds a key.

## Scheduled work

GitHub Actions is refused on billing, so nothing there runs. What does:

- `/api/cron/daily` (Vercel cron, 03:17 UTC): a census slice and a keeper sweep.
- After every judge-facing page render: a census slice if the reading is older
  than fifteen minutes (`src/lib/census/refresh.ts`).
- Point an external monitor at `/api/status` (200 or 503) and `/judges`.

## Scripts

All take `run` to send; without it they print the plan.

| Script | What it does |
|---|---|
| `src/scripts/grid-window.ts run --hours 6` | Grid-1 trades a window through its session and SwapBound |
| `src/scripts/range-recenter.ts run` | Range-1 recenters the demo's out-of-range position |
| `src/scripts/prove-passkey.ts run` | a passkey wallet: grant, execute, revoke, sweep |
| `src/scripts/venus-agents.ts run both` | Yield-1 supplies, Guard-1 repays if under its trigger |
| `src/scripts/hire-strangers.ts run` | ERC-8183 jobs to agents we do not operate |
| `src/scripts/pick-trophy.ts` | draws the fourth stranger from block 121,200,000's hash |
| `src/scripts/pay-house.ts grid-1` | buys one answer over x402, 402 then 200 |
| `src/scripts/sessions.ts list` / `revoke <keyId>` | every key on the account, and ending one |
| `src/scripts/settle-jobs.ts run` | the settle sweeper: reads each stranger job, records a submitted deliverable and checks its hash, settles after the seven-day dispute window, refunds an expired unworked job |
| `src/scripts/register-reference.ts run` | registers Range-1, Grid-1, Yield-1, Guard-1 on ERC-8004, one key each |
| `src/scripts/add-agents.ts <tokenId ...>` | adds newly registered tokens to the committed index from the chain |
| `src/scripts/split-adjudicator.ts run` | moves the adjudicator role to a new key |
| `src/scripts/demo-inventory.ts run` | puts the demo address into its published state |
| `npm run smoke` | walks the six beats against production |

Run them as `npx tsx --env-file=.env --env-file-if-exists=.env.local <script>`.

## When a beat breaks

- **Beat 1 shows nothing out of range.** BNB moved far enough to bring a demo
  position into range. The two positions are 1,500 ticks either side of the
  price at mint, so this needs a move of about 16%. Mint a new one with
  `demo-inventory.ts`; do not recenter the out-of-range one the night before.
- **Beat 4 has no fills.** The runner stopped or the price has not crossed a
  level. `tail` its log; restart `grid-window.ts run`. Fills already on chain
  are never lost.
- **Beat 5 says "not registered" or "expiry differs".** The session in the store
  and the KeyStore disagree. `sessions.ts list` shows every key; revoke the
  stray one and re-grant.
- **A provider is failing.** `/status` shows it; reads skip it for a minute.
  Set `MARKET_RPC_URL` and `BSC_RPC_URL` to two paid providers to put them first.
- **The census is stale.** Load `/judges` once; the refresh runs after the
  response. `/api/cron/daily?job=census` forces one.
- **A stranger job shows SUBMITTED.** Its provider did the work. Settling pays
  them and is only possible once the policy's dispute window (604,800 s) has
  passed after submission; run `settle-jobs.ts run` after that. The SDK's
  `submittedAt` field reports the window's start, not the submission.
- **A key is on the account that /desk does not hold.** Treat it as a finding.
  `sessions.ts revoke <keyId> "<why>"`, and it is listed under keys that ended.
