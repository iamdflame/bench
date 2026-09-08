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

import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { resolveChain, type SupportedChain } from "@bench/shared";
import { cmdBazaar, cmdExamples, cmdMandate, cmdMetrics, cmdProbe, cmdSnapshot, cmdSweep } from "./cli";
import { boardPath } from "./store";

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

/**
 * Serve the board the worker has just written, when a port is available.
 *
 * The gap this closes: the worker keeps the board fresh on its own disk, the
 * site reads a copy committed at deploy time, and the two never meet. Fifteen
 * minutes after a deploy every rail on the site closes — correctly, because a
 * rail not re-checked inside the freshness window is required to shut rather
 * than stay green — and the marketplace shows an empty board while a worker
 * elsewhere knows perfectly well what is callable.
 *
 * So the worker publishes. `railway.json` already runs this process always-on
 * and Railway sets `PORT`; the site reads `BOARD_URL` and falls back to its
 * committed copy when the worker is unreachable. That fallback is the point:
 * the front door of a marketplace must not go blank because a process
 * somewhere else is unhappy.
 */
function serveBoard() {
  const port = Number(process.env.PORT ?? 0);
  if (!port) return;
  const server = createServer((req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, chainId, cycleMs: CYCLE_MS }));
      return;
    }
    const m = /^\/board-(\d+)\.json$/.exec(url.pathname);
    if (!m) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "This worker serves /board-<chainId>.json and /health." }));
      return;
    }
    const path = boardPath(Number(m[1]) as SupportedChain);
    if (!existsSync(path)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `No board has been written for chain ${m[1]} yet.` }));
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      /* Short, because the whole point is freshness, and the site caches too. */
      "cache-control": "public, max-age=30",
      "access-control-allow-origin": "*",
    });
    createReadStream(path).pipe(res);
  });
  server.listen(port, () => log(`serving the board on :${port}`));
  server.unref();
}

async function main() {
  log(`worker starting on chain ${chainId}${once ? ", single cycle" : `, every ${CYCLE_MS / 60000}m`}`);
  if (!once) serveBoard();
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
