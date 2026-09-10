/**
 * Calls every classified agent's endpoint, not just the sixty-one we curated.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/probe-all.ts
 *
 * The census was drawn from a hand-written list of operators, so of the
 * forty-eight agents filed under Grid Trading, exactly zero had ever been
 * called. The board reported that as zero answering, which reads as forty-eight
 * dead endpoints, and it was nothing of the kind: nobody had dialled the
 * number. Publishing "did not answer" over a call that was never made is a
 * false claim about somebody else's software, and it is the specific failure
 * this project exists to object to.
 *
 * So this resolves every classified agent's card from the chain, takes whatever
 * endpoint it advertises, and calls it. What comes back, comes back. Agents
 * that publish no endpoint at all are recorded as publishing none, which is a
 * finding rather than a gap.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readRegistryEntry } from "@/lib/sources/registry";
import { probeAll, type ProbeResult } from "@/lib/probe";
import { readQuote, readPreview, type Quote } from "@/lib/x402/quote";
import { getAgentIndex } from "@/lib/data/agents";

const OUT = join(process.cwd(), "src/data/probe.json");
const RESOLVE_CONCURRENCY = Number(process.env.RESOLVE_CONCURRENCY ?? 8);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/**
 * The endpoint worth calling, in preference order.
 *
 * An x402 endpoint is the most interesting because it can be paid. Failing
 * that, any service URL the card names. The agent card itself is last: it
 * proves the host is up and serving, which is weaker evidence than a service
 * answering, and it is recorded as what it is.
 */
function endpointFor(e: Awaited<ReturnType<typeof readRegistryEntry>>): string | null {
  if (!e) return null;
  if (e.x402Endpoint) return e.x402Endpoint;
  const svc = e.services?.find((s) => typeof s.endpoint === "string" && /^https?:/i.test(s.endpoint));
  if (svc?.endpoint) return svc.endpoint;
  return null;
}

async function main() {
  const agents = getAgentIndex().agents.filter((a) => a.category);
  log(`${agents.length} classified agents; resolving cards from the chain`);

  /*
    A card we could not read is not a card with no endpoint.

    The first version of this collapsed both into `endpoint: null`, and a run
    where the registry or an IPFS gateway was slow marked fifty-three agents as
    publishing nothing to call. That is a false claim about somebody else's
    software, made because our own read failed, and it is the precise error
    this project exists to object to. `unread` keeps them apart, and an unread
    agent carries its previous reading forward rather than being overwritten
    with a worse one.
  */
  const targets: {
    tokenId: string;
    endpoint: string | null;
    category: string;
    unread: boolean;
  }[] = [];
  const queue = [...agents];
  let resolved = 0;

  await Promise.all(
    Array.from({ length: RESOLVE_CONCURRENCY }, async () => {
      for (;;) {
        const a = queue.shift();
        if (!a) return;
        const e = await readRegistryEntry(a.tokenId).catch(() => null);
        targets.push({
          tokenId: a.tokenId,
          endpoint: endpointFor(e),
          category: a.category!,
          // A resolved card with no services is a finding. A card that would
          // not resolve at all is our failure, and is recorded as one.
          unread: e === null || e.cardSource === "unresolved",
        });
        resolved += 1;
        if (resolved % 25 === 0) log(`resolved ${resolved}/${agents.length}`);
      }
    }),
  );

  const withEndpoint = targets.filter((t) => t.endpoint);
  log(`${withEndpoint.length} of ${targets.length} advertise an endpoint; calling them`);

  const results = await probeAll(withEndpoint, 8);

  // Agents that publish nothing are kept in the file, marked as publishing
  // nothing, so the count of "never called" is never confused with "silent".
  const none: ProbeResult[] = targets
    .filter((t) => !t.endpoint)
    .map((t) => ({
      tokenId: t.tokenId,
      endpoint: null,
      answered: false,
      status: null,
      latencyMs: null,
      error: "the card advertises no endpoint",
      at: new Date().toISOString(),
    }));

  /*
    Anything that answered 402 is asked what it charges.

    A 402 is the agent saying "pay me"; the body says how much. Reading it here
    turns "says it charges per call" into a measured figure, and it costs one
    request against the endpoints that already told us they want paying.
  */
  const quoted = results.filter((r) => r.status === 402);
  const quotes: Record<string, Quote> = {};
  const previews: Record<string, unknown> = {};
  if (quoted.length) {
    log(`${quoted.length} answered 402; reading what they charge`);
    for (const r of quoted) {
      if (!r.endpoint) continue;
      const q = await readQuote(r.endpoint);
      if (q) {
        quotes[r.tokenId] = q;
        log(`  ${r.tokenId} ${q.amount} of ${q.assetName ?? q.asset} on ${q.network}${q.payable ? "" : " (not payable by us)"}`);
      }
      const pv = await readPreview(r.endpoint);
      if (pv) previews[r.tokenId] = pv;
    }
  }

  const all = [...results, ...none];
  const answered = all.filter((r) => r.answered).length;

  writeFileSync(
    OUT,
    JSON.stringify({
      at: new Date().toISOString(),
      probed: withEndpoint.length,
      answered,
      quotes,
      previews,
      results: all,
    }),
  );

  const byCat = new Map<string, { called: number; answered: number; none: number; unread: number }>();
  const index = new Map(all.map((r) => [r.tokenId, r]));
  for (const t of targets) {
    const b = byCat.get(t.category) ?? { called: 0, answered: 0, none: 0, unread: 0 };
    if (t.unread) {
      b.unread += 1;
      const before = index.get(t.tokenId);
      if (before?.endpoint) {
        b.called += 1;
        if (before.answered) b.answered += 1;
      }
    } else if (!t.endpoint) b.none += 1;
    else {
      b.called += 1;
      if (index.get(t.tokenId)?.answered) b.answered += 1;
    }
    byCat.set(t.category, b);
  }
  console.log();
  console.log("category              called  answered  no endpoint  unread");
  for (const [c, b] of byCat) {
    console.log(
      `${c.padEnd(22)}${String(b.called).padStart(6)}${String(b.answered).padStart(10)}${String(b.none).padStart(13)}${String(b.unread).padStart(8)}`,
    );
  }
  console.log(`\n${answered} answered of ${withEndpoint.length} called`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
