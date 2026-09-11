/**
 * Reads an ERC-8183 job's deliverable and checks it against the chain.
 *
 *   npx tsx --env-file=.env src/scripts/erc8183-deliverable.ts 56782 [record]
 *
 * A submitted job carries a 32-byte deliverable commitment on chain and a URL
 * in the submit transaction's parameters. The seller's work is only worth what
 * that commitment says it is: fetch the bytes, hash them, and see whether the
 * hash the seller committed is the hash of what it served. AgentCensus's job
 * 56777 failed exactly this test, and we published that rather than settling
 * it, so the same test runs here on everyone, including the sellers we like.
 *
 * `record` writes the verdict into src/data/hires.json beside the hire.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256, toBytes } from "viem";

const OUT = join(process.cwd(), "src/data/hires.json");
const STATUS = ["OPEN", "FUNDED", "SUBMITTED", "COMPLETED", "REJECTED", "EXPIRED"] as const;

async function main() {
  const jobId = BigInt(process.argv[2] ?? "");
  const record = process.argv.includes("record");
  const sdk = (await import("@altananetwork/sdk")) as unknown as {
    BNB: unknown;
    getErc8183Job: (n: unknown, id: bigint) => Promise<Record<string, unknown>>;
    getErc8183DeliverableUrl: (n: unknown, id: bigint, opts?: unknown) => Promise<string | null>;
  };

  const job = await sdk.getErc8183Job(sdk.BNB, jobId);
  const status = STATUS[Number(job.status)] ?? String(job.status);
  const committed = String(job.deliverable ?? "");
  console.log(`job ${jobId}: ${status}, provider ${job.provider}, commitment ${committed}`);

  const url = await sdk.getErc8183DeliverableUrl(sdk.BNB, jobId).catch((e: Error) => {
    console.log(`deliverable url: not found (${e.message.split("\n")[0]})`);
    return null;
  });
  if (!url) return;
  console.log(`deliverable url: ${url}`);

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  const sha = `0x${createHash("sha256").update(text).digest("hex")}`;
  const kec = keccak256(toBytes(text));
  const which = sha === committed ? "sha256" : kec === committed ? "keccak256" : null;
  console.log(`fetched ${res.status}, ${text.length} bytes`);
  console.log(`sha256    ${sha}${sha === committed ? "  matches the chain" : ""}`);
  console.log(`keccak256 ${kec}${kec === committed ? "  matches the chain" : ""}`);
  if (!which) console.log("neither hash matches the commitment on chain; that is a finding, not an error");

  const evidence = `docs/evidence/${new Date().toISOString().slice(0, 10)}-8183-${jobId}-deliverable.json`;
  writeFileSync(
    join(process.cwd(), evidence),
    `${JSON.stringify({ jobId: String(jobId), status, url, httpStatus: res.status, bytes: text.length, sha256: sha, keccak256: kec, onChain: committed, hashMatches: which, body: text.slice(0, 40_000), at: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`kept ${evidence}`);
  console.log(`body: ${text.slice(0, 400)}`);

  if (record && existsSync(OUT)) {
    const doc = JSON.parse(readFileSync(OUT, "utf8")) as { hires: Record<string, unknown>[] };
    const hire = doc.hires.find((h) => String(h.jobId) === String(jobId));
    if (hire) {
      hire.delivery = { status, url, bytes: text.length, sha256: sha, keccak256: kec, onChain: committed, hashMatches: which, evidence, at: new Date().toISOString() };
      writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
      console.log("recorded in src/data/hires.json");
    }
  }
}

main().catch((e) => {
  console.error((e as Error).message.split("\n")[0]);
  process.exitCode = 1;
});
