/** Regenerates src/lib/chain/abiV2.ts from the Foundry artifact. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const artifact = JSON.parse(
  readFileSync(join(process.cwd(), "contracts/out/MandateMarketV2.sol/MandateMarketV2.json"), "utf8"),
) as { abi: unknown[] };

writeFileSync(
  join(process.cwd(), "src/lib/chain/abiV2.ts"),
  `/**
 * MandateMarketV2 ABI, generated from the Foundry artifact.
 *
 * Regenerate with: npm run abi:v2
 */

export const MANDATE_MARKET_V2_ABI = ${JSON.stringify(artifact.abi, null, 2)} as const;
`,
);
console.log(`wrote src/lib/chain/abiV2.ts (${artifact.abi.length} entries)`);
