# Smart Money Era — Ground Truth Research
_Compiled 2026-09-04. Every number here was measured, not assumed._

## The hackathon
- **Main track**: build the BNB Agent Studio Marketplace — browse agents, see what they do
  and how they've performed, put them to work.
- **Prize**: $30,000 + **official adoption as the canonical front door for every agent on BSC.**
  This is a product acquisition, not a hackathon prize. Design for adoption, not for a demo.
- **Judged on**: Functionality (end-to-end journey), **Data Quality ("real-time, accurate data
  that goes beyond basic counts")**, Agent Diversity (all four categories, equal depth).
- **Four required categories**: Rebalancing · Grid Trading · Yield Optimisation · Health Factor Monitoring.
- **Window**: 5 Aug – 9 Sep 2026. Judging 9–23 Sep. Winner 5 Nov.
- **Hard requirement**: publicly accessible and functional during judging; agents live on BSC.

### Partner tracks
| Track | Prize | Gate |
|---|---|---|
| Altana | 50,000 XP | Agent-owned wallets, sessions with call allowlist + spend cap + expiry, registered in Keystore, real onchain txs through session keys, user-facing revocation |
| TermiX | $6k/$3k/$1k | **Agent Advantage Report**: ≥3 real tasks run with agent vs without, time/cost/quality, ≥1 from trading/stock/security |
| PancakeSwap | 1,000 CAKE | Real benefit to traders or LPs |

## The substrate (all verified live)

### 8004scan API — open, no auth
`https://api.8004scan.io/api/v1/...` — 150 endpoints, OpenAPI at `/openapi.json`.
- **Anonymous rate limit: 30 req/min.** Pro tier for participants: 500/min, 100k/day.
  → *Architectural consequence: must index server-side. Never call from the browser.*
- `/agents` filters: `chain_id, is_endpoint_verified, is_active, min_feedbacks, min_score,
  categories, supported_trust, has_mcp, has_a2a, x402_supported, search, sort_by`
- `/agents/{chain_id}/{token_id}` detail exposes: **`agent_wallet`**, `creator_address`,
  `owner_address`, `services`, `health_status`, `scores{quality,popularity,activity,wallet,
  freshness,metadata_completeness}`, `created_tx_hash`, `created_block_number`,
  `is_endpoint_verified`, `raw_metadata.offchain_uri`
- `/feedbacks` exposes **`user_address` (reviewer wallet)**, `transaction_hash`, `block_number`,
  `feedback_uri`, `tag1/tag2`, `is_revoked`. limit max 100. → the full reputation graph is public.

### BSC RPC — open, no key
`https://bsc-rpc.publicnode.com` and `https://bsc-dataseed.bnbchain.org` both live.
`eth_getBalance`, `eth_getTransactionCount`, `eth_getLogs` all work.

## The findings that decide the product

**1. The registry is 99.998% noise.**
```
BSC agents registered ............ 301,160
  with a verified live endpoint ..       5
  with any feedback at all ......      473
```

**2. The reputation layer is manufactured.**
2,900 sampled BSC feedbacks came from **31 unique reviewer wallets**. The top 22 each posted
185–204 feedbacks across 32–35 agents — near-identical cardinality across distinct wallets.
445 reviewer→agent pairs have >3 feedbacks, many at exactly ×12. Machine-generated.

**3. Registered "autonomous agents" have no wallet activity.**
Agent `56:153776` — "BORT Governance Lens #10923", *"Epic-tier autonomous trading agent"*,
`total_score: 12.09` on the official explorer:
- `agent_wallet` == `owner_address` == `creator_address` (not self-custodial at all)
- `eth_getTransactionCount` → **0x1** (one transaction, ever)
- `eth_getBalance` → **0x0** (no BNB)
It has never traded and cannot trade.

**4. The four required categories do not exist in the data.**
`categories: []` and `tags: []` across the registry. Every team must classify agents themselves.
Classification quality is therefore a differentiator, not a given.

### Corroborating peer-reviewed work
Xiong et al., *"Can Trustless Agents Be Trusted?"* (arXiv:2606.26028v2, 8 Jul 2026) — first
empirical study of ERC-8004 across Ethereum/BSC/Base through 13 May 2026:
- Only **3% / 4% / 15%** (ETH/BSC/Base) expose a valid registration file with a live endpoint.
- **73.5% / 59.2% / 90.6%** of reviewers exhibit coordinated Sybil behavior.
- After removing Sybil feedback, **15.8% / 77.9% / 86.8%** of rated agents have no valid feedback.
- Reputation Registry "meets none of the four necessary conditions for a trustworthy score."
- Validation Registry had **no confirmed mainnet deployment** during the study period.

## The strategic read
Every other submission will render `total_score: 12.09` as if it were true, in a grid of cards,
over 301,160 dead agents. That is a directory of garbage with a search box.

BNB Chain cannot adopt a directory of 301,155 non-functional agents as "the canonical front door" —
it would embarrass them. The stated criterion *"data quality that goes beyond basic counts"* is
them saying so out loud.

The winning object is not a better directory. It is the **verification layer that makes a
directory possible**: registry claim vs. on-chain ground truth, with the proof attached.

## Environment constraints
- CPU: Intel i5-3427U (2012, **no AVX2**) — prebuilt binaries may SIGILL (exit 132).
  Prefer plain Node/npm toolchain; avoid Bun and AVX2-dependent native deps.
- Node v24.19.0, npm 11.17.0, Python 3.12.3.
