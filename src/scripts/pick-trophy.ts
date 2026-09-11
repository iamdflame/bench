/**
 * Picks the fourth stranger to hire, by a block hash nobody here chose.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/pick-trophy.ts
 *
 * Three trophy hires are named in advance (Agripinaa's Ranger, AgentCensus,
 * Muster). The fourth must be an agent we have no relationship with, and the
 * only way to show we did not shop for a friend is to let a future block hash
 * pick it. The rule, fixed before the seed block was mined:
 *
 *   candidates = every agent in the committed census whose endpoint answered,
 *                sorted by token id, minus the named teams' owners and ours
 *   seed       = the hash of block SEED_BLOCK
 *   pick       = candidates[seed mod candidates.length]
 *
 * The candidate list, the seed block, its hash and the pick are written to
 * src/data/trophy-pick.json so anyone can re-run the arithmetic.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hexToBigInt } from "viem";
import { bscClient } from "@/lib/chain/rpc";

/** Chosen at 03:40 UTC on 11 Sep 2026, when the chain was near block 121,191,000. */
export const SEED_BLOCK = 121_200_000n;

const EXCLUDED_OWNERS = new Set(
  [
    // Agripinaa (269703-269706, 307486, 307487)
    "0xD6Db7AdE6ED34d1CF0836d7A1aac5ba3B860c82A",
    "0x7d2dCB4eD1a90B992B34C114C924c5643B461DFF",
    "0x344eF980A827e9FF4086Ee95b22aeD0D95d11ac9",
    "0x79827EF1faDeA3B30A8E77fdbaF17944298A3bB6",
    "0x94bD6175e45f5b1054700bbb4CaBcA1Ab4c15173",
    "0x454aC9bae8cC6eA1067F7422992A9Ab2e8DCEdF3",
    // AgentCensus, Muster (named separately)
    "0x0475c8fa8ac94888eab9b4329b93c263708a9a07",
    "0xcd10d44703d6989290e0a8219f345fa0a5bf4c64",
    // Ours: principal, keepers, adjudicator
    "0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90",
    "0xd6d11Aa5046dc5C7BE8d63B9223b60D7AD94cBe9",
    "0x090d19610cdb4d6bb011d9EB579910Ac3296BB0a",
    "0x6F29B50ebaF733D980EadfeB3253347d8a12A69C",
    // Our reference agents' registration owners (Range-1, Grid-1, Yield-1, Guard-1)
    "0x004c7Ae8077560c75fE5687dA39E7bE0697ddBFD",
    "0xbebF6B026e1fFC06A3c8d3C1b57b8142BF027454",
    "0x7e91367c77E561F0d99C2B42925aF29cd90AE838",
    "0x81762d5214fCB6fB3b102beF9D69d13A56c1a2d0",
  ].map((a) => a.toLowerCase()),
);

async function main() {
  const probe = JSON.parse(readFileSync(join(process.cwd(), "src/data/probe.json"), "utf8")) as {
    at: string;
    results: { tokenId: string; endpoint: string | null; answered: boolean; status: number | null }[];
  };
  const agents = JSON.parse(readFileSync(join(process.cwd(), "src/data/agents.json"), "utf8")) as {
    agents: { tokenId: string; name: string | null; owner: string | null }[];
  };
  const byId = new Map(agents.agents.map((a) => [a.tokenId, a]));
  const candidates = probe.results
    .filter((r) => r.answered && r.endpoint)
    .map((r) => ({ ...r, agent: byId.get(r.tokenId) }))
    .filter((r) => r.agent?.owner && !EXCLUDED_OWNERS.has(r.agent.owner.toLowerCase()))
    .sort((a, b) => Number(a.tokenId) - Number(b.tokenId));

  const head = await bscClient().getBlockNumber();
  if (head < SEED_BLOCK) {
    console.log(`seed block ${SEED_BLOCK} is not mined yet (head ${head}, about ${Math.round(Number(SEED_BLOCK - head) * 0.45 / 60)} min away). ${candidates.length} candidates are fixed now.`);
    writeFileSync(
      join(process.cwd(), "src/data/trophy-pick.json"),
      JSON.stringify({ rule: "candidates[hash(SEED_BLOCK) mod n]", seedBlock: Number(SEED_BLOCK), census: probe.at, candidates: candidates.map((c) => c.tokenId), picked: null }, null, 2) + "\n",
    );
    return;
  }
  const block = await bscClient().getBlock({ blockNumber: SEED_BLOCK });
  const index = Number(hexToBigInt(block.hash!) % BigInt(candidates.length));
  const pick = candidates[index];
  const out = {
    rule: "candidates[hash(SEED_BLOCK) mod n], candidates = answered agents in the census, sorted by token id, minus named teams and ours",
    seedBlock: Number(SEED_BLOCK),
    seedHash: block.hash,
    census: probe.at,
    n: candidates.length,
    index,
    candidates: candidates.map((c) => c.tokenId),
    picked: { tokenId: pick.tokenId, name: pick.agent?.name ?? null, owner: pick.agent?.owner ?? null, endpoint: pick.endpoint },
    verify: `cast block ${SEED_BLOCK} --field hash --rpc-url https://bsc-dataseed1.bnbchain.org`,
  };
  writeFileSync(join(process.cwd(), "src/data/trophy-pick.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`seed ${block.hash} mod ${candidates.length} = ${index}: #${pick.tokenId} ${pick.agent?.name} (owner ${pick.agent?.owner})`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
