/**
 * Jobs we paid into escrow for agents we do not operate, and what became of them.
 *
 * Written by `src/scripts/hire-strangers.ts` at the moment each job was funded;
 * the status column is read from the ERC-8183 commerce contract at render
 * time. A funded job is escrow, not payment. The page says "funded, waiting
 * for the provider" until the provider submits, and "refunded" if it never
 * does, because "we hired a stranger" is only true of the ones that worked.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withTimeout } from "@/lib/cache";

export interface StrangerHire {
  tokenId: string;
  who: string;
  provider: string;
  providerVia: string;
  ownerOf: string;
  jobId: string;
  tx: string | null;
  budget: string;
  token: string;
  expiredAt: number;
  statusAtHire: string | null;
  task: string;
  at: string;
  /** Written by settle-jobs.ts once the provider submitted. */
  deliverable?: { url: string | null; committedHash: string; contentHash: string | null; hashMatches: boolean | null; content: string | null; readAt: string };
  settleTx?: string | null;
  refundTx?: string | null;
}

export interface StrangerHireView extends StrangerHire {
  status: string | null;
  statusRead: "live" | "unread";
  expired: boolean;
}

const JOB_STATUS = ["OPEN", "FUNDED", "SUBMITTED", "COMPLETED", "REJECTED", "EXPIRED"];

export function strangerHires(): StrangerHire[] {
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "src/data/hires.json"), "utf8")) as { hires?: StrangerHire[] };
    return raw.hires ?? [];
  } catch {
    return [];
  }
}

type Sdk = { BNB: unknown; getErc8183Job: (network: unknown, jobId: bigint) => Promise<Record<string, unknown>> };

export async function strangerHiresLive(): Promise<StrangerHireView[]> {
  const hires = strangerHires();
  if (!hires.length) return [];
  const sdk = (await import("@altananetwork/sdk").catch(() => null)) as Sdk | null;
  return Promise.all(
    hires.map(async (h) => {
      const job = sdk ? await withTimeout(sdk.getErc8183Job(sdk.BNB, BigInt(h.jobId)).catch(() => null), 6_000) : null;
      const raw = job ? (job.status ?? job.state) : null;
      const status = raw === null || raw === undefined ? null : typeof raw === "number" || typeof raw === "bigint" ? JOB_STATUS[Number(raw)] ?? String(raw) : String(raw);
      return { ...h, status, statusRead: job ? "live" : "unread", expired: Date.now() / 1000 > h.expiredAt } as StrangerHireView;
    }),
  );
}

export function describeStatus(v: StrangerHireView): string {
  switch (v.status) {
    case "FUNDED":
      return v.expired ? "funded, the provider never submitted; refundable" : "funded, waiting for the provider to submit";
    case "SUBMITTED":
      return "the provider submitted work; it can be settled, paying them, once the policy's seven-day dispute window has passed";
    case "COMPLETED":
      return "completed: the provider did the work and was paid";
    case "REJECTED":
      return "rejected";
    case "EXPIRED":
      return "expired and refunded";
    default:
      return v.status ? v.status.toLowerCase() : "status unread this render";
  }
}
