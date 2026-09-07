/**
 * The roster, from the command line.
 *
 *   npm run roster            # status + a live dry-run of each of the eight
 *   npm run roster -- --deploy-plan   # what standing them all up would take
 *
 * Read-only by default: it evaluates every strategy against the chain and prints
 * what each observed, without sending anything. The deploy plan is printed, not
 * executed — funding eight mainnet wallets is the operator's signature, not a
 * script's side effect.
 */

import type { Address } from "viem";
import { ROSTER } from "@/agents/roster";
import { buildContext } from "@/agents/registry";
import { CATEGORY_LABEL } from "@/lib/config";

const REFERENCE_WALLET = (process.env.AGENT_A_ADDR ??
  "0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90") as Address;

const rule = "─".repeat(78);

async function status() {
  console.log(rule);
  console.log("MANDATE roster — eight agents, two per category");
  console.log(rule);
  const deployed = ROSTER.filter((r) => r.wallet).length;
  console.log(`  ${deployed}/${ROSTER.length} running on their own mainnet wallet; the rest dry-run against a reference wallet.\n`);

  for (const r of ROSTER) {
    const wallet = (r.wallet ?? REFERENCE_WALLET) as Address;
    const mode = r.wallet ? "LIVE " : "ready";
    let observed = "—";
    let actions = 0;
    try {
      const ctx = await buildContext({
        category: r.category,
        wallet,
        capWei: 500_000_000_000_000n,
        mandateId: 0,
      });
      const decision = await r.strategy.evaluate(ctx);
      observed = decision.observed;
      actions = decision.actions.length;
    } catch (e) {
      observed = `could not evaluate: ${String(e).slice(0, 100)}`;
    }
    console.log(`  [${mode}] ${r.name}  ·  ${CATEGORY_LABEL[r.category]}  (${r.tier})`);
    console.log(`         wallet   ${wallet}${r.wallet ? "" : "  (reference — not yet funded)"}`);
    console.log(`         observed ${observed}`);
    console.log(`         action   ${actions === 0 ? "none this evaluation" : `${actions} proposed (dry run, nothing sent)`}`);
    console.log(`         proof    ${r.proof}`);
    console.log();
  }
}

function deployPlan() {
  console.log(rule);
  console.log("Standing up the roster on mainnet — the operator's steps");
  console.log(rule);
  console.log(`
  For each agent that does not yet hold its own wallet:

    1. Create a session-capable smart account (passkey), scoped to the category.
         npm run grant -- <category> <mandateId> --cap <bnb> --ttl 30d --register
    2. Register it as an ERC-8004 agent on chain 56 with an honest card.
         npm run register-house
    3. Fund a small own-capital position on the venue for the category.
    4. Start the runner loop so it acts each epoch.
         npm run agent -- <category> --live
    5. Let the worker probe and assay it; it appears on its own board,
       hallmarked by the fineness it actually earns.
         npm run probe && npm run assay -- <tokenId>

  Nothing here is done for you: real capital on mainnet is your signature, not a
  script's. The strategies are built, dry-runnable and scoped; this is the last
  operational mile.
`);
}

const args = process.argv.slice(2);
if (args.includes("--deploy-plan")) {
  deployPlan();
} else {
  await status();
}
