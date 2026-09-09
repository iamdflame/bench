/**
 * The capability evidence, gathered once and published as transaction hashes.
 *
 * `granted ⊆ proven` decides what a hired agent may do, and it needs one fact
 * per agent: has the chain shown this wallet using the protocol its job
 * requires. Asking that question live, per hire, had three problems and they
 * compounded:
 *
 *   IT WAS SLOW. Twenty seconds of `eth_getLogs` before a button could
 *   respond, on the one screen where somebody is deciding to trust us.
 *
 *   IT WAS SHALLOW. A request cannot afford to read two million blocks, so it
 *   read a day's worth and refused agents whose evidence was older. That is
 *   denying authority for want of looking, which is the failure the invariant
 *   exists to prevent.
 *
 *   IT WAS UNVERIFIABLE. The answer was a boolean produced inside a request
 *   nobody else could repeat. This product's whole argument is that such
 *   answers are worth nothing.
 *
 * So the scan moves offline and its output becomes evidence rather than a
 * verdict: for every wallet, the protocol it touched, the transaction that
 * touched it, and the block. Committed, so a reader can open BscScan and check
 * any row without asking us anything. The grant then reads a file, which is
 * instant and deterministic, and a wallet the file does not cover still falls
 * through to a live scan rather than being refused for being absent.
 *
 *   npm run prove -- [--lookback 2000000] [--only 0xwallet]
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import { findProtocolTouches } from "@/lib/sources/bsc";
import { CATEGORY_EVENT_PROBES, CATEGORY_EVIDENCE, PROTOCOL_LABEL, CATEGORIES } from "@/lib/config";
import { HOUSE } from "@/lib/house";
import { allShops } from "@/lib/shops";
import { readPublicIndex } from "@/lib/chain/session";
import type { ProvenIndex, ProvenWallet } from "@/lib/data/proven";

const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const LOOKBACK = BigInt(flag("lookback") ?? 2_000_000);
const ONLY = flag("only")?.toLowerCase();

/** Every protocol any of the four jobs cares about, deduplicated. */
const ALL_PROTOCOLS = [...new Set(CATEGORIES.flatMap((c) => CATEGORY_EVIDENCE[c].map((p) => p.toLowerCase())))];
/** Every event probe, because a router leaves its trace on the pool, not on itself. */
const ALL_PROBES = CATEGORIES.flatMap((c) => CATEGORY_EVENT_PROBES[c]);

interface Target {
  wallet: string;
  label: string;
}

function targets(): Target[] {
  const out = new Map<string, Target>();
  const add = (wallet: string | null | undefined, label: string) => {
    if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return;
    const k = wallet.toLowerCase();
    if (!out.has(k)) out.set(k, { wallet, label });
  };
  for (const h of HOUSE) add(h.wallet, h.name);
  for (const s of allShops()) add(s.owner, `${s.operator.name} · ${s.name}`);
  for (const s of Object.values(readPublicIndex())) add(s.walletAddress, "session wallet");
  /*
    Ordered by what the boards need first.

    The house agents and the operators running real products decide whether
    each of the four jobs has anything hireable on it. A batch mint of forty-four
    identities on one wallet does not, so it is scanned last rather than holding
    up the rows a visitor will actually press.
  */
  const rank = (t: Target) =>
    t.label.startsWith("MANDATE") ? 0 : t.label.startsWith("Agripinaa") ? 1 : t.label.startsWith("session") ? 2 : 3;
  return [...out.values()]
    .filter((t) => !ONLY || t.wallet.toLowerCase() === ONLY)
    .sort((a, b) => rank(a) - rank(b));
}

async function main() {
  const client = createPublicClient({
    chain: bsc,
    transport: http(process.env.BSC_RPC_URL ?? "https://bsc-rpc.publicnode.com"),
  });
  const head = await client.getBlockNumber();
  const list = targets();

  console.log(`proving capability for ${list.length} wallets`);
  console.log(`  head        ${head}`);
  console.log(`  lookback    ${LOOKBACK} blocks`);
  console.log(`  protocols   ${ALL_PROTOCOLS.length}, probes ${ALL_PROBES.length}\n`);

  const out = join(process.cwd(), "src/data/proven.json");
  mkdirSync(dirname(out), { recursive: true });

  /*
    Existing rows are kept and merged into.

    Two million blocks is ten minutes a wallet. Writing only at the end meant a
    rate limit two hours in threw away every row before it, and re-running to
    add one wallet re-scanned the fifteen that had not changed. So the file is
    the accumulator: read what is there, write after every wallet, and a run
    that dies halfway has still banked its work.
  */
  let wallets: Record<string, ProvenWallet> = {};
  try {
    wallets = (JSON.parse(readFileSync(out, "utf8")) as ProvenIndex).wallets ?? {};
    console.log(`  resuming from ${Object.keys(wallets).length} wallets already on file\n`);
  } catch {
    /* No file yet. */
  }

  const flush = () => {
    const index: ProvenIndex = {
      capturedAt: new Date().toISOString(),
      chainId: 56,
      headBlock: head.toString(),
      lookbackBlocks: LOOKBACK.toString(),
      wallets,
    };
    writeFileSync(out, JSON.stringify(index, null, 2));
  };

  async function prove(t: Target) {
    const t0 = Date.now();
    let r;
    try {
      r = await findProtocolTouches(t.wallet, ALL_PROTOCOLS, {
        lookbackBlocks: LOOKBACK,
        eventProbes: ALL_PROBES,
        // Enough to establish which protocols were used; this is an existence
        // question, not a census of every interaction.
        maxHits: 24,
      });
    } catch (e) {
      console.log(`  ${t.label.padEnd(38)} SCAN FAILED  ${String(e).slice(0, 60)}`);
      return;
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const protocols = [...new Set(r.touches.map((x) => x.protocol.toLowerCase()))];

    wallets[t.wallet.toLowerCase()] = {
      wallet: t.wallet,
      label: t.label,
      scannedTo: head.toString(),
      scannedBlocks: r.scannedBlocks.toString(),
      complete: r.complete,
      protocols,
      touches: r.touches.slice(0, 12).map((x) => ({
        protocol: x.protocol.toLowerCase(),
        label: PROTOCOL_LABEL[x.protocol.toLowerCase()] ?? x.protocol,
        tx: x.txHash,
        block: String(x.blockNumber),
      })),
    };
    flush();

    console.log(
      `  ${t.label.padEnd(38)} ${protocols.length} protocol${protocols.length === 1 ? "" : "s"}` +
        `  ${r.touches.length} touches  complete=${r.complete}  ${secs}s` +
        (protocols.length ? `\n      ${protocols.map((p) => PROTOCOL_LABEL[p] ?? p).join(", ")}` : ""),
    );
  }

  /*
    A few at a time, not all at once.

    Sequential is two and a half hours; unbounded parallelism gets the whole run
    rate-limited, and a refused window is recorded as an incomplete scan, which
    correctly but uselessly refuses every grant that depends on it. Three is
    what this provider serves without complaining.
  */
  const LANES = 3;
  const queue = [...list];
  await Promise.all(
    Array.from({ length: LANES }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        await prove(next);
      }
    }),
  );

  console.log(`\nwrote ${Object.keys(wallets).length} wallets to src/data/proven.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
