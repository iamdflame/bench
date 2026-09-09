/**
 * Every call a category grants must be a call that category can prove.
 *
 * `granted ⊆ proven` intersects a category's canonical calls with the
 * protocols its evidence list searches for. A call target absent from that
 * evidence list is therefore unprovable *forever* — the agent can perform the
 * action all day and the scan will never look at the contract it performed it
 * on. That is a silent, permanent denial, and it was true of Venus vBNB under
 * yield-optimisation.
 *
 * Run by `npm run check:config`, and it fails the build rather than reporting.
 */

import { CATEGORIES, CATEGORY_EVIDENCE, PROTOCOL_LABEL } from "@/lib/config";
import { CATEGORY_CALLS } from "@/lib/chain/session";

const problems: string[] = [];

for (const category of CATEGORIES) {
  const evidence = new Set(CATEGORY_EVIDENCE[category].map((a) => a.toLowerCase()));
  const targets = [...new Set(CATEGORY_CALLS[category].map((c) => c.to.toLowerCase()))];
  for (const t of targets) {
    if (!evidence.has(t)) {
      problems.push(
        `${category}: grants calls on ${PROTOCOL_LABEL[t] ?? t}, which its evidence list never searches — those calls can never be earned`,
      );
    }
  }
}

if (problems.length) {
  console.error("\n  granted ⊆ proven is unsatisfiable:\n");
  for (const p of problems) console.error(`    ✗ ${p}`);
  console.error("");
  process.exit(1);
}

console.log(
  `  ✓ every call granted by all ${CATEGORIES.length} categories is provable by that category's evidence`,
);
