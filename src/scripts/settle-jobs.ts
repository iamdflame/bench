/**
 * The settle sweeper: every job we funded for a stranger, taken to its end.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/settle-jobs.ts [run]
 *
 * For each job in src/data/hires.json:
 *   - SUBMITTED: fetch the provider's deliverable, check it against the hash
 *     the provider committed on chain, record it as evidence, and (with `run`)
 *     settle, which pays the provider once the policy's dispute window after
 *     submission has passed. Before then the router refuses, and that refusal
 *     is recorded as "not yet", not as a failure.
 *   - FUNDED and past expiry: claim the refund, so escrow is never left behind.
 *   - anything else: report it.
 *
 * Deliverables are the providers' words and are stored as data, never acted on.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keccak256, toHex, type Address, type Hex } from "viem";

const MODE = process.argv[2] === "run" ? "run" : "plan";
const HIRES = join(process.cwd(), "src/data/hires.json");

type Sdk = {
  BNB: unknown;
  signerFromPrivateKey: (k: Hex) => unknown;
  getErc8183Job: (n: unknown, id: bigint) => Promise<Record<string, unknown>>;
  getErc8183DeliverableUrl: (n: unknown, id: bigint) => Promise<string>;
  settleErc8183Job: (w: { address: Address }, s: unknown, p: { jobId: bigint; action?: "approve" | "dispute" }, o: { network: unknown }) => Promise<{ transactionHash?: Hex; status: string }>;
  buildClaimRefundCall: (chainId: number, jobId: bigint) => { to: Address; data: Hex; value?: bigint };
  createClient: (o: { chains: unknown[] }) => { execute: (o: Record<string, unknown>) => Promise<{ transactionHash?: Hex; status: string }> };
};

async function main() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY is required (the client of these jobs)");
  const pk = (key.startsWith("0x") ? key : `0x${key}`) as Hex;
  const sdk = (await import("@altananetwork/sdk")) as unknown as Sdk;
  const { privateKeyToAccount } = await import("viem/accounts");
  const me = privateKeyToAccount(pk).address;
  const file = JSON.parse(readFileSync(HIRES, "utf8")) as { hires: Record<string, unknown>[] };

  for (const h of file.hires) {
    const jobId = BigInt(String(h.jobId));
    const job = await sdk.getErc8183Job(sdk.BNB, jobId);
    const status = String(job.statusName ?? job.status);
    const expired = Date.now() / 1000 > Number(job.expiredAt);
    console.log(`job ${jobId} (${h.who}): ${status}${expired ? ", past expiry" : ""}`);
    h.lastStatus = status;
    h.lastCheckedAt = new Date().toISOString();

    if (status === "SUBMITTED" || status === "COMPLETED") {
      const url = await sdk.getErc8183DeliverableUrl(sdk.BNB, jobId).catch(() => null);
      let content: string | null = null;
      if (url) {
        const r = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
        const body = r ? ((await r.json().catch(() => null)) as { response?: { content?: string } } | null) : null;
        content = body?.response?.content ?? null;
      }
      const committed = String(job.deliverable ?? "");
      const hashes = content ? [keccak256(toHex(content))] : [];
      const matches = content ? hashes.includes(committed as Hex) : null;
      h.deliverable = { url, committedHash: committed, contentHash: hashes[0] ?? null, hashMatches: matches, content: content ? content.slice(0, 4000) : null, readAt: new Date().toISOString() };
      console.log(`  deliverable ${url ?? "(no url)"}; committed ${committed.slice(0, 18)}…; keccak(content) ${hashes[0]?.slice(0, 18) ?? "n/a"}…; ${matches === null ? "unread" : matches ? "MATCHES" : "does not match (the provider may hash a different encoding)"}`);
      if (status === "SUBMITTED" && MODE === "run") {
        try {
          const r = await sdk.settleErc8183Job({ address: me }, sdk.signerFromPrivateKey(pk), { jobId, action: "approve" }, { network: sdk.BNB });
          h.settleTx = r.transactionHash ?? null;
          console.log(`  settled: ${r.transactionHash ?? "(no hash)"} ${r.status}`);
        } catch (e) {
          const why = String((e as { details?: string; shortMessage?: string }).details ?? (e as Error).message).slice(0, 240);
          h.settleAttempt = { at: new Date().toISOString(), refused: why };
          console.log(`  not settled yet: ${why}`);
        }
      }
    } else if (status === "FUNDED" && expired && MODE === "run") {
      const call = sdk.buildClaimRefundCall(56, jobId);
      const client = sdk.createClient({ chains: [sdk.BNB] });
      const r = await client.execute({ wallet: { address: me }, signer: sdk.signerFromPrivateKey(pk), calls: [call] });
      h.refundTx = r.transactionHash ?? null;
      console.log(`  refund claimed: ${r.transactionHash ?? "(no hash)"}`);
    }
  }
  writeFileSync(HIRES, JSON.stringify(file, null, 2) + "\n");
  if (MODE !== "run") console.log("plan only. Re-run with `run` to settle submitted jobs and refund expired ones.");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
