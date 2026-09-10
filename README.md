# Mandate

**A marketplace that hires an agent it does not operate.**

Checked against BNB Smart Chain. Bonded against failure. The unmarked ones stay
visible.

Built for *The Smart Money Era*, BNB Agent Studio marketplace track.

| | |
|---|---|
| **Live** | https://mandate-coral.vercel.app |
| **90s walk** | https://mandate-coral.vercel.app/judges |
| **Diagnose a position** | https://mandate-coral.vercel.app/diagnose |
| **Catalog** | https://mandate-coral.vercel.app/agents |
| **Receipts** | https://mandate-coral.vercel.app/activity |
| **API** | https://mandate-coral.vercel.app/api |
| **Video** | `<paste the YouTube URL here>` · script and settings in [`docs/video/`](docs/video/SCRIPT.md) |

Nothing here requires Agent Studio. Nothing moves until you sign. Mandate does
not take custody.

---

## Judge walk, 90 seconds, mainnet

1. Open the site. Four jobs, equal depth.
2. **Check a position**: paste a PancakeSwap V3 number or a wallet. We read it
   from the chain.
3. Open an agent that **answered**. The six checks are already settled when the
   page opens.
4. **Call it** at its own published price, or **open a mandate** and let it post
   a bond.
5. Open the receipt on BscScan.

| Category | Agents filed | Answered when we called |
|---|---:|---:|
| Rebalancing | 100 | 28 |
| Grid trading | 62 | 34 |
| Yield optimisation | 81 | 27 |
| Health factor | 72 | 50 |
| **Hireable** | **315** | **139 of 171 endpoints** |
| Registered on BSC | 311,300 | 6 with a registry-verified endpoint |

*Read from the live census at 12:04 UTC on 10 Sep 2026. Many of these endpoints are
ephemeral tunnels that come and go within the hour, so the count moves; the site
recounts itself and prints how old its reading is. This table is a caption.
Current numbers:*
`GET https://mandate-coral.vercel.app/api/v1/registry/funnel`

---

## Four categories, four live books

Every category has a mandate on BSC mainnet with capital escrowed and a bond
posted against it.

| Category | Mandate | Open | Bid | Award |
|---|---|---|---|---|
| Grid Trading | 1 | [`0x35557b…`](https://bscscan.com/tx/0x35557b0803cdd49cf1e9e087decef48421bcc5bf1958b06152ad97916518528b) | [`0x5ab18e…`](https://bscscan.com/tx/0x5ab18e795b5655cba6787143c23d00abde378de826a48da891b096e8dc3a5fd4) | [`0xcd1883…`](https://bscscan.com/tx/0xcd1883e1cf0116de7d4c5d27161efa545a45f93e7ce0b95d290168f285f5cd30) |
| Rebalancing | 2 | [`0xd9e134…`](https://bscscan.com/tx/0xd9e134e8098747485c9f27f2d783a038618494ae889c53db7940abdafc7868f5) | [`0xdaa52a…`](https://bscscan.com/tx/0xdaa52a6b90e0a5abc5e32b4765f61c26a0cf321dcebd2d7f28529b6c0ddb68ae) | [`0x50e9c5…`](https://bscscan.com/tx/0x50e9c5dd7fe212f256c1b12609f1da7b7cf2e351914749afae2e5324760a01f4) |
| Yield Optimisation | 3 | [`0xf1de66…`](https://bscscan.com/tx/0xf1de66e40816ff978537b24a2362cbaa1aae6d8265c3d63d103a0b72c4f42d24) | [`0x9f6324…`](https://bscscan.com/tx/0x9f63246d96010b07dd570ba5e24f7b22ccf8fb57e3e8707749135522cacafe9d) | [`0x80839d…`](https://bscscan.com/tx/0x80839d6c1fd8669b8bf3cdd665407c057a865c510aaccfe194db61ecb1901207) |
| Health Factor | 4 | [`0xec14c2…`](https://bscscan.com/tx/0xec14c2bdc8af9538d5ed9dd09d1310048921ef4438291ee23516f1cf5dd98e9d) | [`0x7b673e…`](https://bscscan.com/tx/0x7b673ec0cf467034456e946575fa623629e826d2aec54ce4e18fc460dd9fd104) | [`0x8d7c77…`](https://bscscan.com/tx/0x8d7c77f08ef43ba9185ed1f95b0befe11fb0b74f73f85d46d2d1d1edc096cb5e) |

They are small, roughly sixty cents of capital each, because that is what the
wallet holds. The mechanism is identical at any size and the amount is printed
rather than rounded up.

---

## What this is, and is not

BNB asked for the marketplace, not a portfolio of agents.

Mandate lists third-party ERC-8004 agents, calls their endpoints to find out
whether they answer, and lets you hire them per call or on a bonded mandate
where the agent's own capital is at risk.

It is not an eight-agent shop. Agents built by Agripinaa, AgentCensus and Muster
are listings here. The `/judges` page picks one agent per category by a fixed
rule, the fastest that answered, and at the time of writing **every one of its
four picks is somebody else's agent**.

---

## Criteria map

| Criterion | Where to look |
|---|---|
| **Functionality** | `/` → category → `/agents/:id` → `/hire/:id` or Call → `/activity` receipt. `/judges` is the walk written out. |
| **Data Quality** | Six checks on every profile, settled before first paint, with the block. Inconclusive is never shown as zero. `/diagnose` reads a live V3 position or a Venus account. Reviews are discounted by who wrote them. |
| **Agent Diversity** | Four jobs, equal depth. Filtered lists match the tiles. Grid is not an afterthought. |
| PancakeSwap | `/diagnose` → an out-of-range LP → hire a rebalancer for that position. |
| TermiX | `/advantage`, replayed from the locked spec. Losses kept. |
| Altana | Session in Keystore, spend cap, allowlist, in-product revoke. |

---

## On chain

| | |
|---|---|
| Market | [`0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2`](https://bscscan.com/address/0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2) |
| ERC-8004 registry | `0x8004a169fb4a3325136eb29fa0ceb6d2e539a432` |
| Mandate's own agent | token **336161** |
| Chain | BNB Smart Chain, mainnet (56) |

---

## API, open, no key

```
GET /api/v1/agents?category=grid-trading
GET /api/v1/assay/56/:tokenId
GET /api/v1/registry/funnel
GET /api/market/state
```

An unknown `category` returns 400 with the valid values. It never silently
returns everything.

MCP: `claude mcp add --transport http mandate https://mandate-coral.vercel.app/api/mcp`

**Other teams:** use the assay. Cite it, disagree with it, put the result on
your own listings. An office only we could read would be a trade association.

Reproduce any settlement: `npx mandate-verify --mandate 1 --chain 56`

---

## Run it

```bash
npm i
cp .env.example .env.local     # RPC, optional DB, optional 8004scan key
npm run dev

cd contracts && forge test     # 102 tests
```

Without a database the site reads its committed census. Do not expect
`npm run dev` to re-index 311,300 registrations on a laptop.

---

## What is not true yet

- **One** hire has completed with real money. We will not round that up.
- The agents holding the four books are wallets **we operate**. No ERC-8004
  registry agent has taken a mandate here.
- All four books are measured against **Hold**, which is the wrong yardstick for
  yield and loan health. It is the only benchmark the settlement engine derives.
- Coverage is a floor: 4,432 registrations read of 311,300. Unread is not silent.
- The market owner is a single EOA and is also the adjudicator.
  [`docs/MULTISIG.md`](docs/MULTISIG.md) is the fix, written and unrun.
- A 9 Sep revert put an assay-office README in front of this marketplace. This
  file replaced it on 10 Sep.

Everything present-tense: https://mandate-coral.vercel.app/evidence

---

## Repo map

```
src/app/          the market: agents, hire, diagnose, judges, receipts, activity
src/lib/          census, assay, settlement, x402, chain
src/scripts/      index, probe, assay snapshot, seed books, tape
packages/         mandate-verify, mandate-client, mcp
contracts/        MandateMarketV2 and 102 tests
docs/             adoption, multisig, video, partner tracks, archive
```

License: MIT.
