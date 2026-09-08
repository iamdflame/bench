/**
 * The worker loop.
 *
 * Runs the stages in the order that keeps the board honest with the fewest
 * requests: sweep a slice of the registry, refresh the paid catalogue, probe
 * the stalest endpoints, then the expensive chain reads. Each stage writes the
 * board back, so a failure late in a cycle keeps everything earlier in it.
 *
 * Probes run every fifteen minutes. A result nobody refreshed inside that
 * window decays toward unavailable, which fails in the safe direction: the
 * worst outcome of decaying early is a row that says "not checked recently",
 * and the worst outcome of decaying late is selling a hire on a dead endpoint.
 */

import { resolveChain } from "@bench/shared";
import { cmdBazaar, cmdExamples, cmdMandate, cmdMetrics, cmdProbe, cmdSnapshot, cmdSweep } from "./cli";

const CYCLE_MS = Number(process.env.CYCLE_MS ?? 15 * 60_000);
const { chainId } = resolveChain(Number(process.env.CHAIN_ID ?? 56));
const once = process.argv.includes("--once");

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log(`${sig} received, finishing this cycle`);
    stopping = true;
  });
}

async function cycle() {
  const stages: [string, () => Promise<void>][] = [
    ["sweep", () => cmdSweep(chainId, 4)],
    ["bazaar", () => cmdBazaar(chainId)],
    ["probe", () => cmdProbe(chainId, 150)],
    ["mandate", () => cmdMandate(chainId, 10)],
    ["metrics", () => cmdMetrics(chainId, 30)],
    ["examples", () => cmdExamples(chainId)],
  ];
  for (const [name, run] of stages) {
    if (stopping) return;
    try {
      await run();
    } catch (e) {
      // A stage that fails must not take the cycle with it. The snapshot's
      // limitations carry what did not happen, so the site can say so.
      log(`${name} failed: ${String(e).slice(0, 200)}`);
    }
  }
}

async function main() {
  log(`worker starting on chain ${chainId}${once ? ", single cycle" : `, every ${CYCLE_MS / 60000}m`}`);
  for (;;) {
    const started = Date.now();
    await cycle();
    if (once || stopping) break;
    const wait = Math.max(0, CYCLE_MS - (Date.now() - started));
    log(`cycle done in ${Math.round((Date.now() - started) / 1000)}s, sleeping ${Math.round(wait / 1000)}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  await cmdSnapshot(chainId).catch(() => {});
  log("worker stopped");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
