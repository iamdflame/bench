/**
 * Assays agents and writes the result back into the ERC-8004 Reputation
 * Registry.
 *
 * Our own research says that registry is worthless — 3,000 records on BSC from
 * 32 wallets, 99% of them by the 14 that flag as a coordinated cohort. The easy
 * response is to route around it and publish a better number somewhere else,
 * which is what every other reader of it does.
 *
 * Repairing it is better, and it is better *for competitors too*: BNB Chain
 * owns that registry, and a record written there improves the asset whether or
 * not anyone adopts our front door. Every record names the block it read and
 * the ERC-8004 identity that wrote it, so a reader can point the same
 * instrument back at us.
 *
 * Dry by default.
 *
 *   npx tsx src/scripts/writeback.ts 2410 153776
 *   npx tsx src/scripts/writeback.ts --top 5 --broadcast
 */

import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import { assayAgent } from "@/lib/assay";
import { buildWriteBack, publishFeedback, MANDATE_AGENT_ID } from "@/lib/chain/reputation";
import { readAgentIndex } from "@/lib/data/agents";
import { CHAIN_ID } from "@/lib/config";

const args = process.argv.slice(2);
const broadcast = args.includes("--broadcast");
const topFlag = args.includes("--top") ? Number(args[args.indexOf("--top") + 1]) : 0;
const ids = args.filter((a) => /^\d+$/.test(a));

async function targets(): Promise<string[]> {
  if (ids.length) return ids;
  if (!topFlag) return [];
  // Agents the registry already carries a score for: the records most worth
  // sitting a checkable measurement beside.
  const index = await readAgentIndex();
  return index.agents
    .filter((a) => (a.feedbacks ?? 0) > 0)
    .sort((a, b) => (b.feedbacks ?? 0) - (a.feedbacks ?? 0))
    .slice(0, topFlag)
    .map((a) => a.tokenId);
}

async function main() {
  const list = await targets();
  if (list.length === 0) {
    console.error("usage: writeback <tokenId...> | --top N   [--broadcast]");
    process.exit(2);
  }

  console.log(`writing as ERC-8004 ${MANDATE_AGENT_ID} on chain ${CHAIN_ID}`);
  console.log(`${list.length} agent(s)${broadcast ? "" : " — dry run, nothing will be sent"}\n`);

  const chain = createPublicClient({
    chain: bsc,
    transport: http(process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org"),
  });

  let written = 0;
  let skipped = 0;

  for (const tokenId of list) {
    try {
      /*
        The block the assay opened at.

        An assay makes many calls and the head moves under it, so this is the
        height it started from rather than a single pinned read — and the
        record says exactly that rather than implying more precision than the
        measurement has.
      */
      const openedAt = await chain.getBlockNumber();

      const report = await assayAgent(CHAIN_ID, tokenId, undefined, {
        registryDeadlineMs: 20_000,
      });

      const record = buildWriteBack({
        agentId: tokenId,
        fineness: report.fineness,
        hallmark: report.hallmark.name,
        findings: report.results.map((r) => `${r.id}:${r.verdict}:${r.finding}`),
        blockNumber: openedAt,
      });

      console.log(`${tokenId.padEnd(8)} fineness ${String(record.fineness).padStart(4)} → score ${String(record.score).padStart(3)}  ${record.hallmark}`);
      console.log(`         ${record.comment}`);

      if (!broadcast) {
        skipped++;
        continue;
      }

      const hash = await publishFeedback(record);
      console.log(`         written  https://bscscan.com/tx/${hash}`);
      written++;
    } catch (e) {
      // A failed assay writes nothing. A record we could not derive is exactly
      // the kind of entry that made this registry worthless.
      console.log(`${tokenId.padEnd(8)} skipped: ${e instanceof Error ? e.message : String(e)}`);
      skipped++;
    }
  }

  console.log(`\n${written} written, ${skipped} skipped`);
  if (!broadcast) console.log("dry run. Pass --broadcast to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
