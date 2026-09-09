/**
 * Validates the Sybil engine against live BSC data.
 *
 * Success means independently reproducing the hand-measured finding: ~31
 * reviewer wallets behind thousands of feedback records, with a large cohort
 * of near-identical profiles.
 */

import { listFeedbacks, type ScanFeedback } from "@/lib/sources/scan";
import { detectCoordination, profileReviewers } from "@/lib/sybil/detect";

const CHAIN = 56;
const PAGES = Number(process.argv[2] ?? 30);

const all: ScanFeedback[] = [];
for (let i = 0; i < PAGES; i++) {
  const page = await listFeedbacks({ chainId: CHAIN, limit: 100, offset: i * 100 });
  const items = page.items ?? [];
  all.push(...items);
  process.stdout.write(`\rfetched ${all.length} / ${page.total} feedbacks`);
  if (items.length < 100) break;
}
console.log("\n");

const profiles = profileReviewers(all);
const flags = detectCoordination(profiles);
const flagged = Object.keys(flags);

console.log(`feedback records analysed : ${all.length}`);
console.log(`distinct reviewer wallets : ${profiles.size}`);
console.log(`flagged as coordinated    : ${flagged.length}  (${pct(flagged.length, profiles.size)})`);

const clean = all.filter((f) => {
  const a = f.user_address?.toLowerCase();
  return a ? !flags[a]?.length : false;
}).length;
console.log(`records surviving cleaning: ${clean}  (${pct(clean, all.length)})`);

console.log("\ntop reviewers by volume:");
[...profiles.values()]
  .sort((a, b) => b.feedbackCount - a.feedbackCount)
  .slice(0, 10)
  .forEach((p) => {
    const mark = flags[p.address]?.length ? "FLAGGED" : "clean  ";
    console.log(
      `  ${mark}  ${p.address.slice(0, 14)}…  ${String(p.feedbackCount).padStart(4)} records  ${String(p.agents.size).padStart(3)} agents`,
    );
  });

const reasons = new Map<string, number>();
for (const rs of Object.values(flags)) {
  for (const r of rs) {
    const key = r.replace(/0x[0-9a-f]{4}…[0-9a-f]{4}/gi, "<addr>").replace(/\d+/g, "N");
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
}
console.log("\nsignals fired:");
[...reasons.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .forEach(([r, n]) => console.log(`  ${String(n).padStart(4)}x  ${r}`));

function pct(a: number, b: number) {
  return b === 0 ? "0%" : `${((a / b) * 100).toFixed(1)}%`;
}
