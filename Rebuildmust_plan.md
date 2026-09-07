# MANDATE — Checkmate plan

How BNB Chain looks at the two URLs and the only honest sentence left is: **this is the marketplace.**

Not “prettier.” Not “we also have jobs.” A **structural** gap. Agripinaa cannot close it in a weekend because it is in their README, their sponsor evidence, and their Solidity (they have none for a market).

**The field is bigger than Agripinaa.** Full autopsy of SMEAI, Docket, ProofEra, PositionCrew, Hevo, and the live token IDs: [MANDATE-FIELD.md](/workspace/MANDATE-FIELD.md). Artifact 1 is no longer “hire their Ranger.” It is **hire the field**.

Company bible: [MANDATE-COMPANY-PLAN.md](/workspace/MANDATE-COMPANY-PLAN.md)  
UI spec: [MANDATE-REBUILD-PLAN.md](/workspace/MANDATE-REBUILD-PLAN.md)  
This file is the **win condition**: the seven artifacts, the judge script, and what we steal from their published wounds.


---

## 0. What I re-checked (7 Sep 2026)

### Them — `san-npm`

Public repos that matter:

| Repo | What it is |
|---|---|
| **agripinaa** | The only marketplace. Live [agripinaa.vercel.app](https://agripinaa.vercel.app) |
| skills-ws | Unrelated skills directory (“Dr Clawdberg”) |
| grocerie, vinsfins | Other apps, same weekend energy |
| dimension-adapters, eliza, goose, swarms-tools, heyanon-sdk, awesome-* | Forks |

They are **one boutique** plus forks. There is no Agripinaa protocol repo, no market contract, no third-party runner.

Their own README, in their words:

- Headline: *“The front door for every agent on BSC.”*
- Then: *“Third-party registrations remain inspectable until a versioned handoff is implemented.”*
- Roadmap still open: subgraph, ERC-8183 jobs, take-rate, ValidationRegistry, **versioned handoff**
- Home CTAs are **View strategy**, not Hire
- Sponsor evidence: Ranger session **expired 2026-08-29**. Today is 7 Sep. That Keystore grant is dead.
- Ranger’s full close → collect → rebalance → re-mint **never ran** (price stayed in range)
- Pancake `mint / decreaseLiquidity / collect` **accept arbitrary recipient** — custody is “account isolation,” not binding. They wrote this down.
- Rebalance cap is **four per week in the runner**, not on-chain
- BTC Grid (#307485) and Rebalancer (#307488) **unverified**
- Activation: **2–3 passkey confirms** depending on venues
- Discovery: 8004scan Pro primary

So the pitch is the mall. The product is eight first-party shops, two of them unverified, third-party cannot be hired, and the poster-child Ranger session is expired.

### Us — `iamdflame`

| Repo | What it is |
|---|---|
| **mandate-bnb** | The market. Live [mandate-coral.vercel.app](https://mandate-coral.vercel.app) |
| **concord** | Same brain: *WebMCP says what a site can do. Nothing says what it can take back.* Mandate is that sentence for agents. |
| autopoiesis, chorus, quorum | Accountability systems. Not this hackathon. |

`docs/DONE.md` still marks **Bonded / Used / Real** as not yet. MCP `open_mandate` / `revoke_session` return `executed: false`. `/hire/*` has been a row without a button. House sessions expire and the floor reads zero.

We already have the **only** MandateMarketV2, assays, Greenfield, slash, succession, CLI, MCP, public API, TermiX locked report. We are missing the last click and live sessions — which is why they are ahead on the brief.

**The gap is not talent. It is: they shipped a boutique UX on eight agents. We shipped a protocol and hid it.**

Checkmate is: put their eight **inside** our hall, turn Grant on, keep a bond on the table, and leave them as a shop that cannot hire *us*.

---

## 1. Why they cannot come close (even if they work all week)

| Capability | Agripinaa | Mandate after this plan | Can they copy? |
|---|---|---|---|
| Hire a **third-party** agent (e.g. our Ranger #336171) | No — inspect only, README says so | **Yes — their Ranger from our ticket** | Needs a runner + allowlist + handoff they listed as future |
| Agent posts **its own bond** and can be **slashed** | No contract | MandateMarketV2, 87 tests, mainnet | Weeks of Solidity + fuzz, not a UI sprint |
| **Succession** (next bidder in the same tx) | No | Already in V2; show it on the desk | Same |
| **Recipient-bound** Pancake calls | They admitted arbitrary recipient | Ticket compiles `to = user` only | They have to redeploy routers |
| On-chain rebalance cap | 4/week in a process | Cap is the session spend + mandate term | Policy rewrite |
| One signature hire | 2–3 passkeys | **One** Grant on the ticket | They chose more confirms |
| Expired demo as evidence | Ranger Keystore grant died 29 Aug | Unexpired sessions on judging day | They can re-grant; we must too — **live or it doesn’t count** |
| Machine front door | Site + 8004scan Pro | Site + `/api/v1` + MCP + `mandate-verify` + x402 door **open** | They have x402 status; they do not have verify/CLI/succession |
| Comparable reputation | 8004scan feedback (TermiX: incomparable) | Assay schema `{job, window, holdout, alpha, slash}` | They would need our measurement, not a CSS pass |
| “Front door for every agent” | Slogan vs 8 SKUs | Register is the product; shops are tenants | Structural |

A judge who understands Agent Studio only needs **one** of the bold rows. We ship all of them.

They can still have a nicer passkey animation. That is not the category.

---

## 2. The seven artifacts (this is the gap)

Ship these as **links in the submission**, not as README poetry. If any one is missing, we are back in a toss-up.

### Artifact 1 — Hire *their* Ranger from *our* desk

URL: `/agents/269706` → **Hire** → ticket → Grant → `/desk` live session labelled `Agripinaa Ranger · shop · unbonded`.

Allowlist: Pancake V3 mint/decrease/collect **with recipient = user**. Tighter than their own grant (they allowed arbitrary recipient).

If this tx exists, their slogan is false and ours is true. They cannot hire `#336171` back. **That is the huge gap.**

If their runner rejects our session, the ticket shows the exact revert and **Hire Ranger (MANDATE)** as the fallback. Still a completed journey. Still our hall.

### Artifact 2 — One-signature Grant on a house agent, live

URL: `/jobs/rebalancing` → Hire Ranger → one signature → desk **live**.

Session in Altana Keystore, **registered** (not ephemeral). Expiry *after* judging. BscScan + explorer.altana.network links on the desk row.

This kills “functionality.” Their 2–3 confirms vs our one is the UX gap. The live Keystore row is the Altana bounty.

### Artifact 3 — Revoke in the desk, dead key

Same row, rust **Revoke**. One tap. Keystore `revoked`. A second action from the old key **fails**. Screenshot + tx.

They have this. We must too or we still lose Altana. Matching here is mandatory; Artifact 1 is the blowout.

### Artifact 4 — Public slash (or a staged miss with a real cut)

One house or shop epoch that **missed the holdout**, `proposeEpoch` + slash, Greenfield receipt, desk copy:

> Lattice missed the mark by 2.1%. Bond cut 25%. Succession is open.

They have surplus-vs-limit on Ophis fills. They have **no** world where the *agent* loses money. A slash is a category they do not occupy.

If we cannot slash before freeze, show the **open challenge window** on a live V2 epoch and the code path. Weaker, still unique. Prefer a real cut.

### Artifact 5 — Compare page: us vs them, same job

`/compare?ids=ranger,agripinaa-ranger`

| | Ranger (MANDATE) | Agripinaa Ranger |
|---|---|---|
| Operator | MANDATE | Agripinaa |
| Bond | 0.0125 BNB | none |
| Last call | *n* ms | *n* ms |
| May | mint/decrease/collect, recipient = you | mint/decrease/collect, recipient unbound (their writeup) |
| Cycle proven | *say honestly* | full cycle not run (their writeup) |
| Hire | button | button (Artifact 1) |

We quote **their** sponsor-evidence against them, with a link. That is data quality as a weapon, not a lecture.

### Artifact 6 — Register is the mall

`/agents?q=269703` hits. `/agents?q=336171` hits. Silent agent: Hire disabled, one sentence. New Studio-shaped mint (or a fresh ERC-8004 we control) appears as Unmarked < 5 min.

Header: `registered · reached · bonded` with block number. No “0 open” as a brand.

They index 288k via 8004scan Pro and then only hire eight. We index and **hire across operators**.

### Artifact 7 — Judge packet (one page, six links)

A `/proof/judge` (or a markdown in the repo they will actually click):

1. Film: 90s silent Journey A (house)  
2. Film: 60s hire Agripinaa Ranger from Mandate  
3. Tx: Grant Ranger (house)  
4. Tx: Revoke  
5. Tx: Grant Agripinaa Ranger (shop) **or** the revert + fallback hire  
6. Tx: slash or open challenge  
7. TermiX report (already locked, keep it)  
8. This compare URL  
9. `npx mandate-verify` on the slash receipt (Proof, not home)

BNB does not have to hunt. The packet is the submission.

---

## 3. Product they see (only what creates the gap)

Tear the assay office off `/`. Do not debate palettes until Artifact 2 works on production.

```
/                 four jobs, English, no npx
/jobs/:slug       house featured, shops listed (their eight live here)
/agents/:id       does / proved / may / may not / Hire
/hire/:id         dark ticket, one Grant
/desk             live, pause, revoke
/compare          Artifact 5
/proof            slash, verify, judge packet
```

House names: **Ranger, Lattice, Steward, Warden**. Their names stay their names on our cards. Kind pills: `MANDATE · bonded` / `Shop · reached` / `Silent`.

Ticket copy for a shop hire:

> This is Agripinaa’s agent, hired on MANDATE. It has not posted a bond here. You can revoke in one tap. Ranger (MANDATE) is the bonded alternative in this job.

That paragraph is the company.

Details of type, paper/ink, components: UI spec. Do not start Fraunces until Grant signs.

---

## 4. Allowlist: steal their published hole

Their sponsor-evidence.md:

> Pancake selectors accept arbitrary recipient/position arguments, so custody boundary relies on account isolation rather than recipient binding.

Our `mandate-allowlist` for `rebalancing@1.2.0`:

- `to` = Pancake PositionManager  
- selectors = mint, decreaseLiquidity, collect  
- **recipient / recipient argument = session owner** (encode it; reject others in the grant or in a tiny wrapper if the PM cannot bind)  
- may not: sweepToken, refundETH, multicall+unwrap  
- cap, expiry on-chain  

Publish the JSON. The ticket is the JSON in English. Their Ranger, hired through us, is **safer than hired through them**. That is a sentence a BNB judge can repeat.

If a wrapper is required, it is a 100-line contract, verified, linked from the ticket. Worth more than a restyle.

---

## 5. House vs shop (diversity without lying)

Four jobs, equal template. Per job:

1. **House** (bonded) — Hire primary  
2. **Shops** — their matching agents, Hire secondary  
3. **Silent** — listed, Hire off  

| Job | House | Shop we list |
|---|---|---|
| LP in range | Ranger #336171 | Agripinaa Ranger #269706, Rebalancer #307488 (unverified pill) |
| Grid | Lattice #336172 | Grid #269703, BTC Grid #307485 (unverified pill) |
| Yield | Steward #336173 | Harvester #269705, Steward #307487 |
| Health | Warden #336174 | Guardian #269704, Venus Guardian #307486 |

We do not hide unverified. We **label** it. That is how we beat “eight live agents” without faking a ninth.

Live mainnet session on **each house job** during judging, or the job’s house card says “Not on desk” and the shop is still hireable. Never four expired keepers.

---

## 6. Judge script (4 minutes — film this)

Hand a BNB judge the phone. Do not speak.

| 0:00 | Open mandate URL. Four jobs. No wallet. |
| 0:20 | Tap Keep an LP in range. Ranger bonded. Agripinaa Ranger listed under Also here. |
| 0:40 | Hire Ranger. Ticket. One Grant. |
| 1:10 | Desk: live, last action, Pause, Revoke. |
| 1:25 | Revoke. Status dead. |
| 1:40 | Back. Hire **Agripinaa Ranger**. Grant (or honest revert + fallback). |
| 2:20 | Compare URL. Bond vs none. Recipient-bound vs their writeup. |
| 2:50 | Proof: slash or challenge. `mandate-verify` command sits here, not on home. |
| 3:10 | Register search `269703`. Hit. Search a silent id. Hire disabled. |
| 3:40 | Stop. |

If this film exists, the main-track rubric is a formality:

- Functionality: land → category → understand → **activate** (twice, two operators)  
- Data quality: bond, not-measured, their own caveats, receipts  
- Diversity: four jobs, house + shop, silent labelled  

Altana: Grant + Revoke txs in the packet.  
Pancake: a position minted **or** a recipient-bound grant on their Ranger. Prefer our Ranger minting one (they already did this once; we have not, and they will mention it).  
TermiX: keep the locked report; do not reopen.

---

## 7. Pancake hole (they are ahead; close it)

They minted position **7271073** through a session. Ranger’s full cycle did not run, but the mint exists.

We need **one** of:

- House Ranger mints a V3 NFT through the session, in-range checks logged, **or**  
- House Ranger completes close/collect/re-mint (the cycle they did not do)

Without this, they still take CAKE. With Artifact 1 + a mint, we take CAKE **and** the main track. Do the mint.

---

## 8. What we stop arguing about

- Fineness, millesimal, office, rungs on `/`  
- `npx` on the hero  
- WebGL floor as the product  
- Auto-open wallet  
- “0 open is the finding”  
- Hiding their agents  
- Another CSS weekend before Artifact 2 is on `mandate-coral.vercel.app`  
- Claiming “unbeatable” in a doc while `/hire` has no button  

`DONE.md` already knows: not yet Bonded / Used / Real. This plan is those three words, in the UI.

---

## 9. Build order (still this, even with no deadline)

**Hour 0–N — Artifact 2+3 only.** Ticket signs. Desk live. Revoke dead. House Ranger. Production.

**Next — Artifact 1.** Shop hire of #269706. Wrapper if needed. Honest revert path.

**Next — Artifact 5+6.** Compare, register search, unverified pills, silent.

**Next — Artifact 4.** Slash or open challenge, Greenfield, Proof.

**Next — Pancake mint** through house Ranger.

**Last — Artifact 7.** Judge packet + two silent films.

**Then** paper/ink, Fraunces, redirects, kill `/start` jargon. Look is a multiplier on a working hall, not a substitute.

Protocol upgrades (multisig, full indexer, insurance, ERC-8183 jobs, Studio webhook) are the **company**. They are not required to make Agripinaa look like a shop. Artifact 1 is.

---

## 10. The sentence BNB should be able to say

> Agripinaa is a very good shop of eight agents with a passkey. MANDATE is the hall: we hired their Ranger from this ticket, we hired a bonded Ranger that can be slashed, we revoked both, and 300k others are on the register with an honest state. That is the front door we asked for.

If they cannot say that after four minutes, we shipped the wrong thing.

If they can, Agripinaa is not in the same category. That is the huge gap. It is not a palette. It is **hiring the other team’s agent, with a tighter allowlist, in a market that can cut them.**

---

*Checkmate = Artifact 1 + 2 + 3 on production. Everything else is how you keep the category after the hackathon.*