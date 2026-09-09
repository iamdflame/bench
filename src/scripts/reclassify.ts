/**
 * Re-derives every stored category from the agent's own words.
 *
 * Classification is computed once by the crawler and stored, and
 * `agent-record` prefers the stored value whenever its confidence is above
 * zero. That is the right precedence — it keeps a page stable between crawls —
 * but it means a fix to the classifier does not reach an already-indexed agent
 * until something re-derives the stored row. Until then the office serves the
 * label the old rule produced while the code that produced it no longer
 * exists, which is the worst of both.
 *
 * So: this reads every row, runs the current classifier over the name and
 * description already stored, and writes back only where the answer moved. It
 * needs no network beyond the database — the text is already there, and
 * re-crawling would change the population as well as the labels, which is a
 * different operation with a different risk.
 *
 * Dry by default, because this writes to whatever database DATABASE_URL points
 * at and that is usually production:
 *
 *   npm run reclassify           # report what would change
 *   npm run reclassify -- --apply
 */

import { eq, and } from "drizzle-orm";
import { db, hasDb, schema } from "@/lib/db/client";
import { classify } from "@/lib/assay/classify";
import { CHAIN_ID } from "@/lib/config";

const APPLY = process.argv.includes("--apply");

async function main() {
  if (!hasDb || !db) {
    console.error(
      "No DATABASE_URL in this environment, so there is nothing to reclassify.\n" +
        "Run it as: npx tsx --env-file=.env src/scripts/reclassify.ts",
    );
    process.exit(1);
  }

  const rows = await db.select().from(schema.agents);
  console.log(`rows read: ${rows.length.toLocaleString()}`);

  const changes: Array<{
    chainId: number;
    tokenId: string;
    name: string | null;
    from: string | null;
    to: string | null;
    confidence: number;
  }> = [];

  for (const r of rows) {
    const c = classify({ name: r.name, description: r.description });
    const storedConfidence = Number(r.categoryConfidence ?? 0);
    // A row is stale if either half of the answer moved. Confidence alone
    // matters because it is what decides whether the stored value is preferred
    // over a fresh classification at read time.
    const moved =
      (r.category ?? null) !== c.category ||
      Math.abs(storedConfidence - c.confidence) > 1e-9;
    if (!moved) continue;
    changes.push({
      chainId: r.chainId,
      tokenId: String(r.tokenId),
      name: r.name,
      from: r.category ?? null,
      to: c.category,
      confidence: c.confidence,
    });
  }

  const recategorised = changes.filter((c) => c.from !== c.to);
  console.log(`rows whose stored answer moved: ${changes.length.toLocaleString()}`);
  console.log(`  of which the category itself: ${recategorised.length.toLocaleString()}`);

  if (recategorised.length > 0) {
    console.log("\ncategory changes:");
    for (const c of recategorised.slice(0, 40)) {
      console.log(
        `  ${c.tokenId.padStart(7)}  ${String(c.from).padEnd(19)} -> ${String(c.to).padEnd(19)}  ${(c.name ?? "").slice(0, 34)}`,
      );
    }
    if (recategorised.length > 40) {
      console.log(`  … and ${recategorised.length - 40} more`);
    }
  }

  if (changes.length === 0) {
    console.log("\nNothing to do: every stored answer already matches the current rule.");
    return;
  }

  if (!APPLY) {
    console.log("\nDry run. Nothing was written. Re-run with --apply to write these.");
    return;
  }

  let written = 0;
  for (const c of changes) {
    await db
      .update(schema.agents)
      .set({ category: c.to, categoryConfidence: c.confidence })
      .where(
        and(
          eq(schema.agents.chainId, c.chainId ?? CHAIN_ID),
          eq(schema.agents.tokenId, c.tokenId),
        ),
      );
    written += 1;
    if (written % 200 === 0) process.stdout.write(`\rwritten ${written}/${changes.length}`);
  }
  console.log(`\rwritten ${written}/${changes.length}`);
  console.log("Done. The office now serves the label the current rule produces.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("reclassify failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
