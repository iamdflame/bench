/**
 * Fixes the Agent Advantage Report's method, and proves it was fixed first.
 *
 *   npx tsx --env-file=.env --env-file=.env.local src/scripts/advantage-lock.ts
 *
 * Writes docs/advantage/INPUT_LOCK.json and sends its hash to BNB Smart Chain.
 * The block that transaction lands in becomes the anchor every task measures
 * backward from, so the window is decided by the chain rather than chosen once
 * the results are visible.
 *
 * The anchor is sent from the agent wallet, not the principal: the principal
 * carries an EIP-7702 delegation (its code is `0xef0100c0f16888…`), so calldata
 * addressed to it is executed by the delegate rather than sitting inert in the
 * block, and a hash is not a valid call into that contract. The recipient of a
 * data anchor has to be a plain EOA, and this checks that it is before sending.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatEther, type Hex } from "viem";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { canonical, specHash, specification, WINDOW_BLOCKS, type Anchor } from "@/advantage/lock";

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const out = join(process.cwd(), "docs/advantage/INPUT_LOCK.json");

const hash = specHash();
const spec = specification();

console.log(`\n  tasks       ${spec.tasks.length}`);
console.log(`  window      ${WINDOW_BLOCKS} blocks (~${((WINDOW_BLOCKS * 0.45) / 3600).toFixed(1)}h at 0.45s)`);
console.log(`  spec hash   ${hash}`);
console.log(`  canonical   ${canonical(spec).length} bytes\n`);

if (process.argv.includes("--dry")) {
  console.log("  --dry: nothing written, nothing sent.\n");
  process.exit(0);
}

if (marketChain.id !== 56) {
  console.error(`  refusing: the anchor must be on BSC mainnet, chain is ${marketChain.id}.\n`);
  process.exit(1);
}

const wallet = walletFor(norm(process.env.AGENT_A_KEY));
const from = wallet.account!.address;

// A delegated account would execute the digest instead of carrying it.
const code = await marketClient.getBytecode({ address: from });
if (code && code !== "0x") {
  console.error(`\n  refusing: ${from} has code (${code.slice(0, 22)}…).`);
  console.error("  A data anchor must go to a plain EOA or it becomes a call.\n");
  process.exit(1);
}

const balance = await marketClient.getBalance({ address: from });
const gasPrice = await marketClient.getGasPrice();

// A self-send carrying nothing but the digest. It moves no value and calls
// nothing; its only job is to put the hash in a block before the run.
const GAS = 30_000n;
const cost = gasPrice * GAS;
console.log(`  anchoring from ${from}  (plain EOA, no delegation)`);
console.log(`  balance ${formatEther(balance)} BNB · this costs about ${formatEther(cost)} BNB`);
if (balance < cost) {
  console.error("\n  refusing: not enough for the anchor transaction.\n");
  process.exit(1);
}

const txHash = await wallet.sendTransaction({
  account: wallet.account!,
  chain: marketChain,
  to: from,
  value: 0n,
  data: hash,
  gas: GAS,
});
const receipt = await marketClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status === "reverted") {
  console.error(`\n  anchor reverted (${txHash})\n`);
  process.exit(1);
}
const block = await marketClient.getBlock({ blockNumber: receipt.blockNumber });

const anchor: Anchor = {
  specHash: hash,
  txHash,
  anchorBlock: Number(receipt.blockNumber),
  anchorTimestamp: Number(block.timestamp),
  fromBlock: Number(receipt.blockNumber) - WINDOW_BLOCKS,
  gasPriceWei: gasPrice.toString(),
  lockedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
};

writeFileSync(out, `${JSON.stringify({ anchor, specification: spec }, null, 2)}\n`);

console.log(`\n  locked`);
console.log(`    tx      https://bscscan.com/tx/${txHash}`);
console.log(`    block   ${anchor.anchorBlock}  (${anchor.lockedAt})`);
console.log(`    window  ${anchor.fromBlock} → ${anchor.anchorBlock}`);
console.log(`    calldata is the spec hash itself, verbatim`);
console.log(`\n  written to docs/advantage/INPUT_LOCK.json`);
console.log(`  the method is now fixed. Nothing in src/advantage/lock.ts may change.\n`);
