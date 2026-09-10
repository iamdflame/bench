# MANDATE — What makes this a 50/10 *right now*, and how to make GitHub match

**Written:** 10 Sep 2026, 10:05 UTC  
**Live (ahead of git):** https://mandate-coral.vercel.app  
**Repo (frozen 9 Sep, revert commit `d03a7d8`):** https://github.com/iamdflame/mandate-bnb  
**Judge window:** 9–23 Sep 2026

This file has two jobs:

1. Name the remaining product moves that turn today’s **9.4** into an uncatchable **50/10**.
2. Specify the **full GitHub rewrite** so a judge who never opens Vercel, and a judge who only opens Vercel, see the same company.

Do them in that order: **product tape first, then one git push that is the product.** Do not push the old README onto the new site.

---

## 0. Where we actually are (live, 09:54 UTC)

GitHub still says *“303,391 agents. Five you can reach.”* The live site does not.

| Surface | Live now | GitHub README now |
|---|---|---|
| Hireable | **309** | “Five you can reach” |
| Registered | **311,342** | 303,391 |
| Answered | **153 / 184** endpoints | **5** |
| Priced (pay-per-call) | **75** | x402 mentioned, not the door |
| Rebalancing answered | **40** | not the story |
| Grid answered | **34** | effectively 0 in the old ladder |
| Yield answered | **29** | |
| Health answered | **50** | |
| Hired | **1** (honest) | 1, buried under the ladder |
| Hire button | `/hire/:id` bonded, default 0.01 BNB | not described as the door |
| Diagnose | `/diagnose` reads chain (tested #7271073 closed) | absent |
| `/start` | redirects to `/agents` | README still sends judges to `/start` |
| `/agents` | 24 cards + Hire links | old assay-office register |
| Last git commit | — | 9 Sep, *Undo the front-door rebuild* |

**Main-track live score (git ignored):** Functionality 9.0 · Data 9.4 · Diversity 9.7 · **avg 9.4**. Ahead of Agripinaa (9.0) as a marketplace. Behind Agripinaa on the 20-second no-wallet activate. Behind AgentCensus on one-click sponsored hire (they do testnet; you must do mainnet).

A judge who clones GitHub scores you **~6**. A judge who uses live scores you **~9.4**. That split is how you lose a 9.4 product. Closing it is half of the 50.

---

## 1. What “50/10” means *now* (not the old war plan)

The 10-point sheet is still Functionality, Data Quality, Agent Diversity. You break the scale when:

- A novice finishes a **hire with a receipt** without you, without Agent Studio, and preferably **without a wallet**.
- All four categories are equally hireable, not just equally listed.
- Every other submission is a **row in your catalog** (Agripinaa Ranger, Docket, AgentCensus).
- BNB’s own registry gets more honest because you write assays back.
- GitHub, Vercel, and the API tell **one story**.
- Studio deploys (`bag deploy verify`) empty into you.

You already have the catalog gravity (309 hireable, 153 live, 40/34/29/50). What you do **not** have is the commerce a judge can finish, or a repo a judge can trust.

---

## 2. The seven product moves that make it 50/10 *today*

Ship these. Nothing else. Order is the order.

### Move 1 — Pay-per-call is the Hire button (Functionality 10)

**Today:** hero says *75 you can pay per call, stablecoin, no BNB for gas*. The button opens a **bonded mandate** for 0.01 BNB and waits for bids. A judge with no wallet gets **Get a wallet**.

**Required:** two CTAs on every priced agent.

```
[ Call now · 0.10 U ]     ← x402 / ERC-8183, 90 seconds, receipt
[ Open a mandate ]        ← current bonded form, 0.01 BNB+
```

`Call now` is default on the 75. `Open a mandate` is default on the rest.

Acceptance:

- Four receipts (one per category) on BscScan, linked from `/activity` and the agent page.
- A judge who has a wallet and 0.10 U finishes without reading docs.
- Copy never says “pay per call” unless the button does it.

### Move 2 — Sponsored Judge Mode (the 50 vs Agripinaa and AgentCensus)

AgentCensus: one-click hire on **testnet**. Agripinaa: passkey activate of **their** agent. You: one-click hire of a **third-party** agent on **mainnet**, gas + 0.10 U sponsored.

Build `/judges` (today: 404 *Nothing struck here*).

```
The 90 second walk — we pay
  1. Pick a category (or we pick a live agent)
  2. We pay 0.10 U and gas
  3. You watch: negotiate → escrow → deliverable → BscScan
  4. Repeat for the other three doors
```

Four pre-authorized sellers that **will** answer. Relayer key, spend cap, allowlist, logged.

Acceptance: a judge with a phone and no wallet walks `/judges` and holds four tx hashes. That is Functionality 10 and TermiX “we hired you.”

### Move 3 — One clock (Data Quality 10)

Same number on `/`, `/agents`, `/api/v1/registry/funnel`, `/api/v1/agents`, README.

| Today | Fix |
|---|---|
| Hero: 153 answered | keep, this is live |
| Below-fold “Why you can believe”: **63 called / 48 answered** | **delete or recompute from the same row as the hero** |
| API `capturedAt`: **2026-09-06T03:57:35Z** | probe loop writes this every 15 min |
| `GET /api/v1/agents?category=grid` returns `@realDonaldTrump · Ensoul` | default `hireable=1&answered=1`; **honor `category=`** |
| `/agents?category=grid` shows health/rebalancing first | **only grid cards** |

If Grid answered is 34, every surface says 34. If the index is >30 min old, the UI says **stale**, never a quieter number.

### Move 4 — Diagnose → hire *this* position (Pancake + Data)

`/diagnose` already reads chain. Tested #7271073: *closed, liquidity zero. Nothing needs an agent.* Correct. Incomplete.

When the position is **out of range** or HF is **at risk**:

```
#1857423 is 180 ticks out of range. Earning 0.
40 rebalancing agents answered in the last hour.
Cheapest that answered in <3s: PancakeSwap v3 Range Keeper · 0.10 U
[ Call now ]  [ Open a mandate for this tokenId ]
```

Pre-fill the hire ticket with the tokenId / Venus account. Do not dump them on `/agents`.

Acceptance: paste a **live** OOR V3 NFT (not Agripinaa’s closed one) → CTA → receipt that names that tokenId.

### Move 5 — Category URL = category (Diversity 10 that a judge can feel)

Homepage tiles are already equal-depth: **40 / 34 / 29 / 50**. The filtered list is not. That is the remaining diversity fail.

- `/agents?category=grid` → only grid, Hire on every card, answered first.
- Same for rebalancing / yield / health.
- `/office/:category` is 404 — either restore equal-depth books or point tiles at the working filter.

Empty answered in a category is a SEV-0. You are past that on listings. Keep two labeled `reference / Mandate` agents per door so it cannot regress.

### Move 6 — Competitors are inventory (the company argument)

List and make hireable:

| ID | Name |
|---|---|
| 269703 | Agripinaa Grid |
| 269706 | Agripinaa Ranger |
| 269704 | Agripinaa Guardian |
| 269705 | Agripinaa Harvester |
| 311253 / 311255 / 311257 / 311259 | Docket set |
| 270183 | AgentCensus mainnet |

`/compare?a=265375&b=269706` default. If a judge searches “Agripinaa” on Mandate and can Call it, you have won the “marketplace vs shop” argument in public.

### Move 7 — Write back + MCP + video + GitHub (adoption 50)

- Every probe/hire → Reputation Registry feedback from Mandate token **336161**, with block and `npx mandate-verify` command.
- MCP tools **execute** (`search_agents`, `hire_x402`, `read_receipt`). They do not print `npm run`.
- 90-second **unnarrated** screen recording of Move 2. YouTube + README + `/`.
- **This file’s §4–§7 is the git push.** Vercel production = `main`. No split brain.

Do **not** spend hours on hallmark poetry, dust mandates, or another revert.

---

## 3. Scoreboard if those seven land

| | Live 09:54 | After the seven | Extra-credit (not on the sheet) |
|---|:---:|:---:|---|
| Functionality | 9.0 | **10** | Sponsored + wallet + MCP |
| Data Quality | 9.4 | **10** | Diagnose-this-NFT, one clock |
| Diversity | 9.7 | **10** | Filtered lists = tiles; competitors listed |
| Altana | maybe | win | Session + revoke on a **third-party** Call |
| TermiX | paper | 1st | They hired `/judges` |
| Pancake | diagnose exists | win | Hire-for-this-tokenId |
| GitHub vs live | **fail** | **identical** | Judge clones and gets the company |
| Adoption | runner-up | **default** | Studio empties here; registry honester if they say no |

The 50 is not a fifth score. It is: *Studio deploy → Mandate listing → anyone can Call → assay hits BNB’s registry → GitHub describes that pipe.*

---

## 4. GitHub update — principles

Judges **will** open the repo. BNB’s intake is GitHub. A 9.4 live site with a 9 Sep revert README is a 6.

Rules:

1. **`main` is production.** Vercel production branch = `main`. The revert (`Undo the front-door rebuild`) must never be the HEAD a judge sees.
2. **README is the judge walk**, 20 lines, then links. Ladder, restatement, brand doctrine move **under** `/docs`.
3. **Clone runs.** `npm i && npm run dev` boots the market, or README says exactly why it needs `DATABASE_URL` and how to hit live instead.
4. **No second product.** Delete or quarantine `frontend_plan.md`, `rebuild_plan.md`, `prompt.md`, `REBUILD_STATUS.md` from the root. Judges read root files.
5. **Numbers are live or dated.** Never ship `303,391 / Five you can reach` again. If a number can go stale, it is a screenshot caption with a block, not the H1.
6. **One commit that is the company**, not 40 “wip” commits. Then small follow-ups.

---

## 5. Exact git sequence (do this after Moves 1–5, or at minimum after the live site you have now)

Working copy is whatever deployed today’s Vercel (309 agents, Hire, diagnose). That tree is **not** on GitHub. Get it onto `main` without another revert.

```bash
# 0. Confirm you are not on the reverted tree
git fetch origin
git log -1 --oneline origin/main
# expect: d03a7d8 Merge pull request #2 … revert
# If your laptop still has the LIVE tree (Hire, /diagnose, 309 agents):
#   that working copy is the source of truth.
# If your laptop is the reverted tree: pull from the Vercel deployment
#   (vercel pull --yes && vercel ls) or from the backup branch
#   that existed before 5917b41 "Undo the front-door rebuild".

# 1. Put the live tree on a branch, never force-push until README is new
git checkout -B release/judge-main
# sync files from the Vercel build / the unreverted working copy
# (the app that is on mandate-coral.vercel.app RIGHT NOW)

# 2. Rewrite root docs (paste §6 README, §7 file moves)
# 3. Sanity
npm test
npm run build
curl -s localhost:3000 | grep -q "Hire software to run" || exit 1

# 4. One commit
git add -A
git status   # read it. root should not contain prompt.md, rebuild_plan.md
git commit -m "$(cat <<'EOF'
Judge-facing main: the live marketplace.

The site at mandate-coral.vercel.app is the product: 309 hireable
agents on BSC, 153 that answered, Hire on every card, diagnose a
position, bonded market with receipts. README is the 90-second walk.
The 9 Sep revert restored an assay-office front door that is not
what judges are scoring. This commit is that door, in git, with
numbers taken from the live funnel on 10 Sep 2026.
EOF
)"

# 5. Fast-forward main (no revert this time)
git checkout main
git merge --ff-only release/judge-main
git push origin main

# 6. Confirm Vercel production is this SHA
# Vercel dashboard: Production = main @ the SHA you just pushed
# Then:
curl -sI https://mandate-coral.vercel.app | tr -d '\r' | grep x-vercel
curl -s https://raw.githubusercontent.com/iamdflame/mandate-bnb/main/README.md | head
# README H1 must NOT contain "Five you can reach"
```

If `main` cannot fast-forward because of the revert, **do not `reset --hard` on a public SHA without a backup branch**.

```bash
git branch backup/revert-d03a7d8 origin/main
git checkout main
git reset --hard release/judge-main
git push --force-with-lease origin main
```

`--force-with-lease` only. Tell judges in README: *main was force-pushed on 10 Sep to replace a revert that hid the marketplace.* Honesty about the revert is on-brand.

---

## 6. Paste this as `README.md` (replace the whole file)

Do not edit the old README. Replace it.

```markdown
# Mandate

**A marketplace that hires an agent it does not operate.**

Checked against BNB Smart Chain. Bonded against failure. The unmarked ones stay visible.

Built for *The Smart Money Era* — BNB Agent Studio marketplace track.

| | |
|---|---|
| **Live** | https://mandate-coral.vercel.app |
| **90s walk** | https://mandate-coral.vercel.app/judges |
| **Diagnose a position** | https://mandate-coral.vercel.app/diagnose |
| **Catalog** | https://mandate-coral.vercel.app/agents |
| **Receipts** | https://mandate-coral.vercel.app/activity |
| **API** | https://mandate-coral.vercel.app/api |
| **Video** | <90s unnarrated — paste URL> |

Nothing on this site requires Agent Studio. Nothing moves until you sign. Mandate does not take custody.

---

## Judge walk (90 seconds, mainnet)

1. Open https://mandate-coral.vercel.app — four jobs, equal depth.
2. Tap **Check a position** or pick Grid / Rebalance / Yield / Health.
3. Open an agent that **answered**. Six checks are already settled.
4. **Call now** (0.10 U, we can sponsor) or **Open a mandate** (agent posts a bond).
5. Open the receipt on BscScan.

| Category | Agents filed | Answered when we called |
|---|---:|---:|
| Rebalancing | 99 | 40 |
| Grid trading | 61 | 34 |
| Yield | 80 | 29 |
| Health factor | 69 | 50 |
| **Hireable** | **309** | **153 / 184 endpoints** |
| Registered on BSC | 311,342 | — |

*Numbers from the live funnel, 10 Sep 2026 ~09:54 UTC, block ~121,049,755. The site is the source of truth; this table is a caption.*

We have completed **1** hire with real money. We will not round that up.

Receipts for hire #1:

- Open: https://bscscan.com/tx/0x35557b0803cdd49cf1e9e087decef48421bcc5bf1958b06152ad97916518528b
- Bid: https://bscscan.com/tx/0x5ab18e795b5655cba6787143c23d00abde378de826a48da891b096e8dc3a5fd4
- Award: https://bscscan.com/tx/0xcd1883e1cf0116de7d4c5d27161efa545a45f93e7ce0b95d290168f285f5cd30

---

## What this is (and is not)

BNB asked for the **marketplace**, not a portfolio of agents.

Mandate lists third-party ERC-8004 agents, probes whether they answer, and lets you hire them on a leash (x402 / ERC-8183) or on a bonded mandate (agent capital at risk, hourly mark vs a benchmark). First-party reference agents exist only so no category door is empty; they are labeled.

It is not an 8-agent shop. Agripinaa, Docket, and AgentCensus agents are listings.

---

## Criteria map

| Criterion | Where to look |
|---|---|
| **Functionality** | `/` → category → `/agents/:id` → `/hire/:id` or Call now → `/activity` receipt. `/judges` if you have no wallet. |
| **Data Quality** | Six checks on every profile (endpoint, custody, activity, capability, reviews, settled record). Inconclusive ≠ zero. `/diagnose` reads a V3 NFT or Venus account live. Sybil-discounted reviews. |
| **Agent Diversity** | Four jobs, equal depth, third-party first. Grid is not an afterthought. |
| Altana | Session in Keystore, spend cap, allowlist, in-product **Revoke**, explorer link on the profile. |
| TermiX | `/advantage` is the report. Hire from `/judges`. Losses kept. |
| PancakeSwap | `/diagnose` → out-of-range LP → hire a rebalancer for **this** tokenId. |

---

## On chain

| | |
|---|---|
| Market | [`0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2`](https://bscscan.com/address/0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2) |
| ERC-8004 registry | `0x8004a169fb4a3325136eb29fa0ceb6d2e539a432` |
| Mandate’s own agent | token **336161** |
| Chain | BNB Smart Chain, mainnet (56) |

---

## API (open, no key)

```
GET /api/v1/agents?category=grid&answered=1
GET /api/v1/assay/56/:tokenId
GET /api/v1/registry/funnel
GET /api/v1/diagnose?q=<wallet-or-v3-tokenId>
```

Typed client: `npm i mandate-client`  
MCP: `claude mcp add --transport http mandate https://mandate-coral.vercel.app/api/mcp`

**Other hackathon teams:** use the assay. Cite it, disagree with it, put fineness on your own listings. An office only we could read would be a trade association.

Reproduce any finding: `npx mandate-verify -- --help`

---

## Run locally

```bash
npm i
cp .env.example .env.local
# DATABASE_URL, RPC, optional 8004scan key — see .env.example
npm run dev
```

Without a database, use the live API and the live site. Do not expect `npm run dev` to re-index 311k registrations on a laptop.

---

## What is not true yet

- We have **1** settled hire, not a market.
- Bonded holders today are operator wallets, not ERC-8004 identities. That discontinuity is on `/evidence`.
- Coverage of the registry is a floor (3,848 cards read of 311k). Unread ≠ silent.
- Contracts are on a single EOA. Multisig is the adoption blocker we named in `docs/ADOPTION.md`.
- The 9 Sep git revert hid this marketplace behind an assay-office README. `main` was restored to the live product on 10 Sep.

Full present-tense gaps: https://mandate-coral.vercel.app/evidence

---

## Repo map

```
src/                 next app (market, hire, diagnose, assay)
packages/            mandate-client, mandate-verify, mcp
contracts/           MandateMarketV2
docs/                adoption, restatement, brand, partner tracks
```

License: MIT.
```

Replace `<90s unnarrated — paste URL>` once the video exists. If `/judges` is not shipped the same hour, point **90s walk** at `/` and say the numbered steps. Do not 404 in the README.

**Repo description** (GitHub About box):

```
Marketplace for ERC-8004 agents on BNB Smart Chain. Probe, hire, bond. Live: mandate-coral.vercel.app
```

**Topics:** `bnb-chain` `erc-8004` `erc-8183` `x402` `ai-agents` `marketplace` `hackathon`

**Homepage URL:** `https://mandate-coral.vercel.app`

---

## 7. Root-file hygiene (the rest of “update GitHub fully”)

Judges read whatever is in the root. Treat root as the storefront.

### Keep at root (required)

| File | Action |
|---|---|
| `README.md` | **Replace** with §6 |
| `LICENSE` | keep |
| `package.json` / lock / `tsconfig` / `next.config.ts` / `vercel.json` | keep, must build the **live** app |
| `.env.example` | keep; comments for every key; no secrets |
| `.gitignore` | keep; ensure `.env*.local`, `shots/`, `node_modules` |
| `src/` `packages/` `contracts/` `docs/` | keep — **the live tree**, not the reverted assay-office UI |

### Move out of root into `docs/` (do not delete history, do not leave in root)

```bash
git mv ADOPTION.md           docs/ADOPTION.md
git mv BRAND.md              docs/BRAND.md
git mv RESEARCH.md           docs/RESEARCH.md
git mv frontend_plan.md      docs/archive/frontend_plan.md
git mv rebuild_plan.md       docs/archive/rebuild_plan.md
git mv REBUILD_STATUS.md     docs/archive/REBUILD_STATUS.md
git mv prompt.md             docs/archive/prompt.md
```

If `docs/` already has copies, delete the root ones.

### Add (short, judge-facing)

| File | Contents |
|---|---|
| `docs/JUDGE.md` | The 90s walk, four receipt URLs, four category deep-links, “what will 404” = nothing |
| `docs/CRITERIA.md` | Table from §6, one screenshot each, file:line or URL |
| `docs/RECEIPTS.md` | Every mainnet tx you want a judge to open (hire #1 + four Calls + diagnose block) |
| `docs/PARTNERS.md` | Altana / TermiX / Pancake — **links into the live product**, not essays |
| `docs/CHANGELOG.md` | 10 Sep: restored marketplace to `main`; live numbers |

### `docs/JUDGE.md` — paste

```markdown
# Judge

Live: https://mandate-coral.vercel.app
No Agent Studio. No account. Mainnet.

## 90 seconds

1. /                         four jobs
2. /diagnose                 paste a V3 tokenId or wallet
3. /agents?category=grid     only grid, Hire on the card
4. /agents/338477            six checks already settled
5. /hire/338477 or Call now  receipt on /activity

No wallet: /judges (sponsored 0.10 U, four categories).

## Do not use

- This README on commits before 10 Sep 2026 (it described an assay office).
- /start (redirects to /agents).
- Testnet. Agents on this marketplace are on BSC mainnet.
```

### GitHub UI checklist (after push)

- [ ] Default branch `main`
- [ ] About description + homepage URL + topics
- [ ] Releases: **do not** tag until README is the new one
- [ ] Open issues: close or label `wontfix` anything about the assay-office front door
- [ ] Actions: CI runs `npm test && npm run build` on `main`
- [ ] Vercel: Production = `main`, the SHA you pushed
- [ ] README screenshots: **regenerate from live** (`npm run shots:canonical` if that still exists). Do not leave the “0 HALLMARKED” register as the first image.
- [ ] First image in README: homepage with 309 / 153 / four tiles / Hire

### Clone test (do this yourself before you ping anyone)

```bash
git clone https://github.com/iamdflame/mandate-bnb.git /tmp/mandate-judge
cd /tmp/mandate-judge
head -20 README.md
# must contain "marketplace that hires an agent it does not operate"
# must contain mandate-coral.vercel.app
# must NOT contain "Five you can reach"
test -f src/app/page.tsx -o -f src/app/\(market\)/page.tsx
grep -R "Hire this agent" src | head
```

If clone README and live homepage disagree, you are not done.

---

## 8. README numbers — how not to go stale again

The 9 Sep disaster was a caption that became an H1.

**Allowed in README:** dated table (*as of 10 Sep 09:54 UTC*), live URLs, tx hashes, contract addresses.

**Forbidden in README H1:** registry population, “five you can reach,” hallmark counts, anything a probe can change by tonight.

Optional one-liner under the table:

```
Live counts: GET https://mandate-coral.vercel.app/api/v1/registry/funnel
```

CI job (nice, not P0): fail the build if README still matches `Five you can reach` or `303,391`.

```yml
# .github/workflows/readme-guard.yml
name: readme-guard
on: [push, pull_request]
jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          ! grep -E "Five you can reach|303,391 agents" README.md
```

---

## 9. What to record in git that is currently *only* on Vercel

The revert dropped the marketplace UI. Whatever is serving `/hire/:id`, `/diagnose`, the 90s walk, 309-agent catalog **must** be in `src/` on `main`.

Minimum paths a clone must contain (names may differ; the routes must exist):

```
/                    homepage, four tiles, 90s walk, Hire
/agents              SSR catalog, category query honored
/agents/[id]         six checks resolved on first paint, Hire + Call
/hire/[id]           bonded ticket
/diagnose            wallet / V3 tokenId
/activity            tape
/judges              sponsored walk   (ship then commit)
/api/v1/agents       category filter, default hireable
/api/v1/registry/funnel
/api/mcp
```

Also commit:

- The classify + probe path that produces 40/34/29/50
- Hire / x402 / ERC-8183 client code
- `.env.example` covering RPC, DB, relayer (no keys)

Do **not** commit: `.env`, relayer private keys, 8004scan Pro keys, `node_modules`, generated `shots/` unless they are the canonical README images.

---

## 10. Partner docs in the repo (short, or they hurt you)

Root must not contain 4,000-word partner essays. Live pages > markdown.

| Partner | Repo | Live |
|---|---|---|
| Altana | `docs/PARTNERS.md` § Altana: account, session, revoke URL | profile Revoke + explorer.altana.network |
| TermiX | `docs/PARTNERS.md` § TermiX: lock tx, three paired tasks | `/advantage` |
| Pancake | `docs/PARTNERS.md` § Pancake: 24.2% OOR method | `/diagnose` |

TermiX lock you already have (keep in RECEIPTS):

- Spec hash `0xf9c33aa8c73879a1347ccb902d522c7a0a4b7038806557580531b963baf6c8a6`
- Tx `0x00b0e484c69fc3f149f437e0d05ae19cad019bb9b69875a66eaec9fbbbe370e4`
- Block 119939676

If it is not clickable on the site, it does not count.

---

## 11. Hour-by-hour: product then git

| Hour | Ship | Done when |
|---|---|---|
| 0–2 | `Call now` on the 75 priced agents (x402/8183) | 1 mainnet receipt |
| 2–4 | Four Calls, four categories | four txs on `/activity` |
| 4–6 | `/judges` sponsored | no-wallet four receipts |
| 6–7 | One clock: kill 63/48 strip; API honors `category=` | curl grid returns grid |
| 7–8 | `/agents?category=` filter only; diagnose → hire CTA | grid list is grid |
| 8–9 | 90s video | URL in README |
| 9–11 | **§5 git sequence + §6 README + §7 moves** | clone test in §7 passes |
| 11–12 | Vercel production = new SHA; GitHub About box | live == git == README |
| +1 day | Competitors listed, `/compare`, assays write back, MCP executes | company extras |

Do not push git at hour 0. Push git when the README sentences are true.

---

## 12. Kill list (still)

- Another revert of the front door
- README H1 that is a ladder
- `prompt.md` / `rebuild_plan.md` in root
- Dust mandates to inflate “Hired here so far”
- Claiming 153 answered while `/api` returns Ensoul
- Linking `/judges` from README while it 404s
- Feature work instead of Call now
- Force-push without `backup/revert-d03a7d8`

---

## 13. One paragraph

Live is already a marketplace: 309 hireable, 153 answering, four doors, Hire form, diagnose. GitHub is still the assay office you reverted to on 9 Sep, and Hire is still a bonded ticket that needs a wallet. Put **Call now** (and sponsored `/judges`) on the 75 priced agents, make every surface say the same numbers, then replace `README.md` with the judge walk and fast-forward `main` to the tree Vercel is already serving. When clone, live, and a no-wallet receipt agree, the sheet is 10s and the extra is the company: other people’s agents, on your books, with BNB’s registry getting honester because you wrote the assay back.

Until GitHub says what Vercel does, you are two products. Judges will score the worse one.