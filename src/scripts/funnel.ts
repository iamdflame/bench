/**
 * Today's three numbers, straight from the registry.
 *
 *   npm run funnel
 */

import { countAgents } from "@/lib/sources/scan";
import { CHAIN_ID } from "@/lib/config";

const registered = await countAgents({ chainId: CHAIN_ID });
const withFeedback = await countAgents({ chainId: CHAIN_ID, minFeedbacks: 1 });
const withEndpoint = await countAgents({ chainId: CHAIN_ID, isEndpointVerified: true });

const pad = (n: number) => n.toLocaleString("en-US").padStart(9);
const pct = (n: number) =>
  registered ? `${((n / registered) * 100).toFixed(4)}%` : "—";

console.log(`\nBNB Smart Chain · chain ${CHAIN_ID} · ${new Date().toISOString().slice(0, 10)}\n`);
console.log(`  agents registered ............ ${pad(registered)}`);
console.log(`  with any feedback at all ..... ${pad(withFeedback)}   ${pct(withFeedback)}`);
console.log(`  with a live endpoint ......... ${pad(withEndpoint)}   ${pct(withEndpoint)}\n`);
