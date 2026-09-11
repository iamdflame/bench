/**
 * Grid-1 trades a real window on mainnet, through its session, through SwapBound.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/grid-window.ts            # plan
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/grid-window.ts run --hours 6 --every 60
 *
 * The strategy is `src/agents/grid.ts`, unchanged in logic: an anchor, levels
 * either side, buy on a crossing down, sell on a crossing up, one clip per
 * crossing. What is new is that every fill is a transaction: the session's
 * only permitted call is `SwapBound.swap`, which pays the principal and nobody
 * else. The window's numbers are then read back from SwapBound's own events
 * (`src/lib/grid/window.ts`), not from anything this loop remembers.
 *
 * The session is not registered in the KeyStore. Registration costs 0.0007 BNB,
 * it changes nothing about what the key can do (the account enforces the
 * allowlist either way), and /desk labels it as unregistered.
 *
 * Stops on its own when the principal's BNB falls under the reserve.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatEther, parseAbi, parseEther, type Abi, type Address, type Hex } from "viem";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { gasPrice } from "@/lib/chain/marketV2";
import { GRID_CALLS, SWAP_BOUND, SWAP_BOUND_ABI, USDT, WBNB, WBNB_USDT_POOL } from "@/lib/chain/leash";
import { getSession, grantScopedSession, providerFor } from "@/lib/chain/session";
import { recordExecution } from "@/lib/chain/session-store";
import { store } from "@/lib/data/snapshots";
import { readGridWindow } from "@/lib/grid/window";
import { gridStrategy } from "@/agents/grid";
import { closeDb } from "@/lib/db/client";
import type { AgentContext } from "@/agents/types";

const args = process.argv.slice(2);
const MODE = args[0] === "run" ? "run" : "plan";
const flag = (n: string, d: number) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const HOURS = flag("hours", 6);
const EVERY_S = flag("every", 60);

const STATE = join(process.cwd(), "src/data/grid-state.json");
const OUT = join(process.cwd(), "src/data/grid-window.json");
/** Eight clips of 0.0002 WBNB (about $0.14 each). */
const CAP_WEI = parseEther("0.0016");
const WBNB_TARGET = parseEther("0.0006");
const BNB_RESERVE = parseEther("0.0015");

const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function deposit() payable"]);
const SLOT0 = parseAbi(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint32,bool)"]);

const norm = (k: string) => (k.startsWith("0x") ? k : `0x${k}`) as Hex;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function readMarket(principal: Address) {
  const [slot, usdt, wbnb, bnb] = await Promise.all([
    marketClient.readContract({ address: WBNB_USDT_POOL, abi: SLOT0, functionName: "slot0" }),
    marketClient.readContract({ address: USDT, abi: ERC20, functionName: "balanceOf", args: [principal] }),
    marketClient.readContract({ address: WBNB, abi: ERC20, functionName: "balanceOf", args: [principal] }),
    marketClient.getBalance({ address: principal }),
  ]);
  const sqrt = Number(slot[0]) / 2 ** 96;
  return { tick: Number(slot[1]), usdtPerBnb: 1 / (sqrt * sqrt), usdt, wbnb, bnb };
}

async function main() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY is required");
  const admin = walletFor(norm(key));
  const principal = admin.account!.address;
  const sessionId = `house:grid-1:${principal.toLowerCase()}`;

  const [m, capA, capB, spentA, spentB, allowU, allowW] = await Promise.all([
    readMarket(principal),
    marketClient.readContract({ address: SWAP_BOUND, abi: SWAP_BOUND_ABI, functionName: "capA" }),
    marketClient.readContract({ address: SWAP_BOUND, abi: SWAP_BOUND_ABI, functionName: "capB" }),
    marketClient.readContract({ address: SWAP_BOUND, abi: SWAP_BOUND_ABI, functionName: "spentA" }),
    marketClient.readContract({ address: SWAP_BOUND, abi: SWAP_BOUND_ABI, functionName: "spentB" }),
    marketClient.readContract({ address: USDT, abi: ERC20, functionName: "allowance", args: [principal, SWAP_BOUND] }),
    marketClient.readContract({ address: WBNB, abi: ERC20, functionName: "allowance", args: [principal, SWAP_BOUND] }),
  ]);
  log(`principal ${principal}: ${formatEther(m.bnb)} BNB, ${formatEther(m.usdt)} USDT, ${formatEther(m.wbnb)} WBNB; BNB $${m.usdtPerBnb.toFixed(2)} (tick ${m.tick})`);
  log(`SwapBound ${SWAP_BOUND}: sold USDT ${formatEther(spentA)}/${formatEther(capA)}, sold WBNB ${formatEther(spentB)}/${formatEther(capB)}; approvals USDT ${formatEther(allowU)}, WBNB ${formatEther(allowW)}`);
  log(`plan: ${HOURS} h window, evaluate every ${EVERY_S} s, clip ${formatEther(CAP_WEI / 8n)} WBNB, stop under ${formatEther(BNB_RESERVE)} BNB`);
  if (MODE !== "run") {
    log("plan only. Re-run with `run`.");
    return;
  }

  // Inventory to sell: wrap up to the target, from the principal's own BNB.
  if (m.wbnb < WBNB_TARGET && m.bnb > WBNB_TARGET + BNB_RESERVE) {
    const amount = WBNB_TARGET - m.wbnb;
    const hash = await admin.sendTransaction({ account: admin.account!, chain: marketChain, to: WBNB, value: amount, data: "0xd0e30db0", gasPrice: await gasPrice() });
    await marketClient.waitForTransactionReceipt({ hash });
    log(`wrapped ${formatEther(amount)} BNB for sell inventory: ${hash}`);
  }

  let rec = await getSession(sessionId);
  const endAt = Date.now() + HOURS * 3_600_000;
  if (!rec || rec.revokedAt || rec.expiry * 1000 < endAt + 3_600_000) {
    log("granting the Grid-1 session (one call: SwapBound.swap; not KeyStore-registered)");
    rec = await grantScopedSession({
      id: sessionId,
      kind: "house",
      label: "Grid-1 on the demo address",
      category: "grid-trading",
      calls: GRID_CALLS,
      tokenSpend: [
        { token: USDT, limit: parseEther("1") },
        { token: WBNB, limit: parseEther("0.003") },
      ],
      nativeSpendWei: parseEther("0.002"),
      capWei: 0n,
      ttlSeconds: Math.ceil(HOURS * 3600 + 24 * 3600),
      register: false,
      meta: { swapBound: SWAP_BOUND, stepBps: Number(process.env.GRID_STEP_BPS ?? 25) },
    });
    log(`session key ${rec.publicKey.slice(0, 18)}… expires ${new Date(rec.expiry * 1000).toISOString()}`);
  }
  const executor = (await providerFor(sessionId)).makeExecutor({ client: marketClient });

  let state: Record<string, unknown> = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
  let fillsThisRun = 0;
  while (Date.now() < endAt) {
    const now = await readMarket(principal).catch(() => null);
    if (!now) {
      log("market read failed; retrying next tick");
    } else if (now.bnb < BNB_RESERVE) {
      log(`principal BNB ${formatEther(now.bnb)} is under the reserve; stopping`);
      break;
    } else {
      const ctx = {
        mandateId: 0,
        category: "grid-trading",
        wallet: principal,
        capWei: CAP_WEI,
        price: { tick: now.tick, token0PerToken1: now.usdtPerBnb },
        valuation: { parts: [] },
        balances: { usdt: Number(now.usdt) / 1e18, wbnb: Number(now.wbnb) / 1e18 },
        state,
        now: Date.now(),
      } as unknown as AgentContext;
      const decision = await gridStrategy.evaluate(ctx);
      // Held back until the chain confirms a fill; see below.
      const before = state;
      state = decision.state;
      const stamped = { ...state, stepBps: Number(process.env.GRID_STEP_BPS ?? 25), levels: 4, clipWbnb: formatEther(CAP_WEI / 8n), priceNow: now.usdtPerBnb, updatedAt: new Date().toISOString() };
      writeFileSync(STATE, JSON.stringify(stamped, null, 2) + "\n");
      // So a deployed instance (the x402 endpoint, /desk) can compute the next signal.
      await store("grid-state", stamped).catch(() => undefined);
      if (!decision.actions.length) {
        log(decision.observed);
      } else {
        for (const a of decision.actions) {
          /*
            The relay can accept an intent and answer PENDING with no hash.
            Whether the fill happened is then a question for the chain, not for
            the relay: SwapBound's lifetime spent counter moves on every fill,
            so it is read before and, if the relay cannot confirm, again after
            a wait. If it did not move, the strategy's state is rolled back so
            the next tick sees the same crossing again.
          */
          const spent = async () =>
            (await marketClient.readContract({ address: SWAP_BOUND, abi: SWAP_BOUND_ABI, functionName: "spentA" })) +
            (await marketClient.readContract({ address: SWAP_BOUND, abi: SWAP_BOUND_ABI, functionName: "spentB" }));
          const spentBefore = await spent().catch(() => null);
          try {
            const r = (await executor.execute({ call: { ...a.call, abi: SWAP_BOUND_ABI as unknown as Abi }, value: a.value, description: a.reason } as never)) as { transactionHash: Hex };
            const receipt = await marketClient.waitForTransactionReceipt({ hash: r.transactionHash });
            fillsThisRun += receipt.status === "success" ? 1 : 0;
            if (receipt.status !== "success") state = before;
            log(`${receipt.status === "success" ? "FILL" : "REVERTED"} ${a.reason}: ${r.transactionHash}`);
            await recordExecution(sessionId, { tx: r.transactionHash, description: a.reason, status: receipt.status }).catch(() => undefined);
          } catch (e) {
            log(`relay could not confirm: ${String((e as { details?: string }).details ?? e).slice(0, 200)}`);
            await new Promise((res) => setTimeout(res, 30_000));
            const spentAfter = await spent().catch(() => null);
            if (spentBefore !== null && spentAfter !== null && spentAfter > spentBefore) {
              fillsThisRun += 1;
              log(`FILL (landed; the relay answered late) ${a.reason}`);
            } else {
              state = before;
              log(`no fill on chain; strategy state rolled back to level ${String((before as { lastLevel?: number }).lastLevel ?? 0)}`);
            }
          }
        }
        writeFileSync(STATE, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2) + "\n");
        await store("grid-state", { ...state, updatedAt: new Date().toISOString() }).catch(() => undefined);
        const w = await readGridWindow({ fresh: true }).catch((e) => (log("window read failed", (e as Error).message), null));
        if (w) {
          writeFileSync(OUT, JSON.stringify(w, null, 2) + "\n");
          await store("grid-window", w, w.readAt).catch(() => undefined);
          log(`window: ${w.fills.length} fills, ${w.roundTrips.length} round trips, win rate ${w.winRate === null ? "n/a" : (w.winRate * 100).toFixed(0) + "%"}, pnl $${w.pnlUsd.toFixed(4)}, max drawdown $${w.maxDrawdownUsd.toFixed(4)}`);
        }
      }
    }
    await new Promise((r) => setTimeout(r, EVERY_S * 1000));
  }

  const w = await readGridWindow({ fresh: true });
  writeFileSync(OUT, JSON.stringify(w, null, 2) + "\n");
  await store("grid-window", w, w.readAt).catch(() => undefined);
  log(`done: ${fillsThisRun} fills this run; ${w.fills.length} in the window; written ${OUT}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
