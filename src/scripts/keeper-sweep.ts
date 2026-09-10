/**
 * Bid on every open mandate that has no bid from us yet.
 *
 *   npm run keeper:sweep
 *
 * The same logic the API route runs, driven from a terminal, so the keeper can
 * be exercised and audited without going through a deployment.
 */

import { keeperBid, keeperConfigured, openMandatesNeedingBids } from "@/lib/keeper/bid";

async function main() {
  if (!keeperConfigured()) throw new Error("No AGENT_A_KEY or AGENT_B_KEY is set.");
  const open = await openMandatesNeedingBids();
  if (!open.length) {
    console.log("no mandate is open for bids");
    return;
  }
  console.log(`open for bids: ${open.join(", ")}`);
  for (const id of open) {
    const r = await keeperBid(id);
    console.log(r.ok ? `  ${id}: bid ${r.bondWei} wei · ${r.hash}` : `  ${id}: ${r.why}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
