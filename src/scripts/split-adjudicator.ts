/**
 * Separates the adjudicator from the owner, on chain.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/split-adjudicator.ts [run]
 *
 * One key held both roles since the deployment. This nominates a different
 * key from the owner and accepts from that key, the contract's own two-step
 * so a mistyped address cannot orphan the role. The new key is generated here
 * if `ADJUDICATOR_KEY` is unset, appended to `.env`, and never printed; it is
 * funded from the principal with enough for a few hundred epoch proposals at
 * measured gas.
 *
 * Evidence lands in `src/data/roles.json`: both addresses, both transaction
 * hashes, the block, and the command that re-reads the roles.
 */

import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatEther, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { MARKET_V2 } from "@/lib/chain/deployments";
import { acceptAdjudicator, adjudicatorWallet, gasPrice, nominateAdjudicator, roles } from "@/lib/chain/marketV2";

const MODE = process.argv[2] === "run" ? "run" : "plan";
const FUND_WEI = parseEther("0.0007");
const OUT = join(process.cwd(), "src/data/roles.json");
const norm = (k: string) => (k.startsWith("0x") ? k : `0x${k}`) as Hex;

async function main() {
  const ownerKey = process.env.PRIVATE_KEY;
  if (!ownerKey) throw new Error("PRIVATE_KEY is required (the owner)");
  const owner = walletFor(norm(ownerKey));

  if (!process.env.ADJUDICATOR_KEY) {
    const fresh = generatePrivateKey();
    const addr = privateKeyToAccount(fresh).address;
    if (MODE === "run") {
      appendFileSync(join(process.cwd(), ".env"), `\n# Adjudicator, generated ${new Date().toISOString()} by split-adjudicator.ts\nADJUDICATOR_KEY=${fresh}\nADJUDICATOR_ADDR=${addr}\n`);
      process.env.ADJUDICATOR_KEY = fresh;
      console.log(`generated a new adjudicator key for ${addr}; written to .env`);
    } else {
      console.log(`plan: would generate a new adjudicator key (address unknown until generated) and write it to .env`);
      process.env.ADJUDICATOR_KEY = fresh; // for the plan's address arithmetic only
    }
  }
  const adj = adjudicatorWallet();
  const next = adj.account!.address as Address;

  const before = await roles();
  console.log(`owner        ${before.owner}`);
  console.log(`adjudicator  ${before.adjudicator}`);
  console.log(`pending      ${before.pendingAdjudicator}`);
  console.log(`candidate    ${next}`);
  if (before.adjudicator.toLowerCase() === next.toLowerCase()) {
    console.log("already the adjudicator; nothing to do");
    return;
  }
  const [oBal, nBal, price] = await Promise.all([
    marketClient.getBalance({ address: owner.account!.address }),
    marketClient.getBalance({ address: next }),
    gasPrice(),
  ]);
  console.log(`owner holds ${formatEther(oBal)} BNB; candidate holds ${formatEther(nBal)} BNB; gas ${Number(price) / 1e9} gwei`);
  if (MODE !== "run") {
    console.log("plan only. Re-run with `run` to send: fund, nominate, accept.");
    return;
  }

  let fundTx: Hex | undefined;
  if (nBal < FUND_WEI / 2n) {
    fundTx = await owner.sendTransaction({ account: owner.account!, chain: marketChain, to: next, value: FUND_WEI, gasPrice: price });
    await marketClient.waitForTransactionReceipt({ hash: fundTx });
    console.log(`funded ${formatEther(FUND_WEI)} BNB: ${fundTx}`);
  }
  const nominateTx = await nominateAdjudicator(owner, next);
  console.log(`nominated: ${nominateTx}`);
  const acceptTx = await acceptAdjudicator(adj);
  console.log(`accepted:  ${acceptTx}`);

  const after = await roles();
  const record = {
    market: MARKET_V2,
    chainId: marketChain.id,
    owner: after.owner,
    adjudicator: after.adjudicator,
    ownerIsSafe: false,
    split: after.owner.toLowerCase() !== after.adjudicator.toLowerCase(),
    txs: { fund: fundTx ?? null, nominate: nominateTx, accept: acceptTx },
    block: after.block,
    at: new Date().toISOString(),
    verify: `cast call ${MARKET_V2} "adjudicator()(address)" --rpc-url https://bsc-rpc.publicnode.com && cast call ${MARKET_V2} "owner()(address)" --rpc-url https://bsc-rpc.publicnode.com`,
  };
  writeFileSync(OUT, JSON.stringify(record, null, 2) + "\n");
  console.log(`\nowner ${after.owner}\nadjudicator ${after.adjudicator}\nsplit: ${record.split}\nwritten ${OUT}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
