/**
 * Assay one agent from the command line.
 *
 *   npm run assay -- 153776
 *   npm run assay -- 56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:153776
 */

import { assayAgent } from "@/lib/assay";
import { isHallmarked } from "@/lib/assay/types";

const raw = process.argv[2];
if (!raw) {
  console.error("usage: npm run assay -- <tokenId | chain:registry:tokenId>");
  process.exit(1);
}

const parts = raw.split(":");
const tokenId = (parts.at(-1) ?? "").trim();
const chainId = parts.length > 1 ? Number(parts[0]) : Number(process.env.CHAIN_ID ?? 56);

if (!/^\d+$/.test(tokenId)) {
  console.error(`not a token id: ${raw}`);
  process.exit(1);
}

const report = await assayAgent(chainId, tokenId, (ev) => {
  if (!ev.result) process.stdout.write(`\r  ${ev.stage}…`.padEnd(60));
});
process.stdout.write("\r".padEnd(60) + "\r");

const rule = "─".repeat(72);
console.log(rule);
console.log(`${report.name ?? "Unnamed agent"}`);
console.log(`${report.agentId}`);
console.log(rule);

for (const r of report.results) {
  const mark = r.verdict === "pass" ? "✓" : r.verdict === "fail" ? "×" : "–";
  console.log(`\n${mark} ${r.title.toUpperCase()}   ${r.score.toFixed(2)} × ${r.weight}   ${r.ms}ms`);
  console.log(`  claim   ${wrap(r.claim)}`);
  console.log(`  finding ${wrap(r.finding)}`);
  for (const e of r.evidence.slice(0, 4)) {
    console.log(`          · ${e.label}: ${e.value.slice(0, 70)}`);
  }
}

console.log(`\n${rule}`);
console.log(
  `FINENESS  ${report.fineness} / 1000   ${report.hallmark.mark} ${report.hallmark.name}` +
    `${isHallmarked(report.fineness) ? "  [hallmark struck]" : "  [unstruck]"}`,
);
console.log(`registry reports ${report.registryScore ?? "—"}   ·   assayed in ${report.ms}ms`);
console.log(rule);

function wrap(s: string, width = 62) {
  const words = s.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + w).length > width) {
      lines.push(line.trimEnd());
      line = "";
    }
    line += `${w} `;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join("\n          ");
}
