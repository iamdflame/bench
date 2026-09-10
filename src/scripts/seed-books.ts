/**
 * One live book in each of the four categories, on BSC mainnet.
 *
 *   npm run seed:books -- plan     cost it against the balances, send nothing
 *   npm run seed:books -- run      open, bid and award one mandate per category
 *
 * Three of the four categories have never had a mandate on the canonical
 * market. The tape showed grid trading twice and nothing else, so a marketplace
 * claiming four equally deep categories had books in one of them.
 *
 * **On size.** These are opened at the contract's own floor, roughly sixty
 * cents each, because that is what the wallet holds. That is small enough for a
 * reader to dismiss and the tape says so rather than dressing it up. The
 * mechanism is identical at any size: real capital escrowed, a real bond posted
 * by a separate account, slashing on the same schedule.
 *
 * **On benchmarks.** All four open under `Benchmark.Hold`, including yield and
 * health factor, where the contract's own comments say Hold is the wrong
 * yardstick. `measureAlpha` implements no other benchmark, so opening them
 * under one would produce a mandate nothing could ever settle. Hold and say so
 * beats correct and unsettleable, and every receipt carries the caveat.
 */

import { formatEther, parseEther, parseGwei, type Address, type Hex } from "viem";
import { marketClient, walletFor, marketChain } from "@/lib/chain/market";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/config";
import { valueWallet } from "@/lib/chain/prices";
import {
  award,
  bid,
  marketParameters,
  openMandate,
  openMandateArgs,
  requiredBond,
  type ObservationV2,
  ZERO_REF,
} from "@/lib/chain/marketV2";
import { MARKET_V2 } from "@/lib/chain/deployments";
import { MANDATE_MARKET_V2_ABI } from "@/lib/chain/abiV2";

const MODE = process.argv[2] ?? "plan";
const CAPITAL = parseEther("0.0002");
const EPOCH_SECONDS = 3_600;
const EPOCHS_TOTAL = 24;

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const bnb = (w: bigint) => `${Number(formatEther(w)).toFixed(6)} BNB`;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const principal = walletFor(norm(process.env.PRIVATE_KEY));
const agent = walletFor(norm(process.env.AGENT_B_KEY ?? process.env.AGENT_A_KEY));

async function openingFor(wallet: Address): Promise<ObservationV2> {
  const v = await valueWallet(wallet);
  if (v.weiTotal === 0n) {
    throw new Error(
      `${wallet} values at zero and the contract refuses an opening mark of zero. Fund it first.`,
    );
  }
  return {
    wallet,
    valuationWei: v.weiTotal,
    gasSpentWei: 0n,
    priceX96: v.sqrtPriceX96,
    blockNumber: v.blockNumber,
    breakdownRef: ZERO_REF,
    // Under Hold the benchmark is the opening value: it does not move, so
    // alpha reduces to the raw return.
    benchmarkWei: v.weiTotal,
  };
}

async function existingCategories(): Promise<Set<number>> {
  const count = Number(
    await marketClient.readContract({
      address: MARKET_V2,
      abi: MANDATE_MARKET_V2_ABI,
      functionName: "mandateCount",
    } as never),
  );
  const seen = new Set<number>();
  for (let id = 0; id < count; id++) {
    const m = (await marketClient.readContract({
      address: MARKET_V2,
      abi: MANDATE_MARKET_V2_ABI,
      functionName: "getMandate",
      args: [BigInt(id)],
    } as never)) as { category: number; state: number };
    if (m.state === 0 || m.state === 1) seen.add(m.category);
  }
  return seen;
}

async function main() {
  if (marketChain.id !== 56) throw new Error(`refusing: this is for BSC mainnet, chain is ${marketChain.id}`);

  const p = principal.account!.address;
  const a = agent.account!.address;
  const params = await marketParameters();
  if (params.paused) throw new Error("the market is paused");

  const pBal = await marketClient.getBalance({ address: p });
  const aBal = await marketClient.getBalance({ address: a });
  log(`principal ${p} · ${bnb(pBal)}`);
  log(`agent     ${a} · ${bnb(aBal)}`);

  const live = await existingCategories();
  const missing = CATEGORIES.map((c, i) => ({ c, i })).filter(({ i }) => !live.has(i));
  log(`categories with a live book: ${[...live].map((i) => CATEGORY_LABEL[CATEGORIES[i]!]).join(", ") || "none"}`);
  log(`to open: ${missing.map(({ c }) => CATEGORY_LABEL[c]).join(", ") || "none"}`);
  if (!missing.length) return;

  // Bond is the larger of the flat minimum and a fifth of the capital.
  const bondEach = (CAPITAL / 5n > params.minBond ? CAPITAL / 5n : params.minBond) * 105n / 100n;
  const gasEach = parseEther("0.00025");
  const needPrincipal = BigInt(missing.length) * (CAPITAL + gasEach * 2n);
  const needAgent = BigInt(missing.length) * (bondEach + gasEach);

  log(`\nplan: ${missing.length} books · ${bnb(CAPITAL)} capital each · ${bnb(bondEach)} bond each`);
  log(`  principal needs ~${bnb(needPrincipal)} · holds ${bnb(pBal)}`);
  log(`  agent     needs ~${bnb(needAgent)} · holds ${bnb(aBal)}`);
  if (pBal < needPrincipal) throw new Error("the principal cannot cover this");
  if (aBal < needAgent) {
    const top = needAgent - aBal + gasEach;
    if (MODE !== "run") {
      log(`  agent is short ${bnb(top)}; a run would top it up from the principal`);
    } else {
      log(`  topping the agent up by ${bnb(top)}`);
      const h = await principal.sendTransaction({
        account: principal.account!,
        chain: marketChain,
        to: a,
        value: top,
        // See the note in marketV2.ts: the quoted price is the floor and the
        // floor does not propagate.
        gasPrice: parseGwei("3"),
      });
      await marketClient.waitForTransactionReceipt({ hash: h });
    }
  }

  if (MODE !== "run") {
    log("\nplan only. Re-run with `run` to send.");
    return;
  }

  const opened: { category: Category; id: number; open: Hex; bid: Hex; award: Hex }[] = [];

  for (const { c, i } of missing) {
    log(`\n${CATEGORY_LABEL[c]}`);
    const args = openMandateArgs({
      category: i as 0 | 1 | 2 | 3,
      benchmark: 0, // Hold; the only benchmark measureAlpha can derive
      toleranceBps: 200,
      feeBps: 2_000,
      slashBps: 2_500,
      epochLength: EPOCH_SECONDS,
      epochsTotal: EPOCHS_TOTAL,
      strikes: 3,
      catastrophicBps: -1_000,
      bondFloorBps: 2_000,
    });
    const openTx = await openMandate(principal, args, CAPITAL);
    const id = Number(
      await marketClient.readContract({
        address: MARKET_V2,
        abi: MANDATE_MARKET_V2_ABI,
        functionName: "mandateCount",
      } as never),
    ) - 1;
    log(`  opened  mandate ${id} · ${bnb(CAPITAL)} · ${openTx}`);

    const floor = await requiredBond(id);
    const bond = (floor * 105n) / 100n;
    const bidTx = await bid(agent, id, 100, bond);
    log(`  bid     ${bnb(bond)} at +1.00% per epoch · ${bidTx}`);

    const opening = await openingFor(a);
    const awardTx = await award(principal, id, 0, opening);
    log(`  awarded opening mark ${bnb(opening.valuationWei)} at block ${opening.blockNumber} · ${awardTx}`);

    opened.push({ category: c, id, open: openTx, bid: bidTx, award: awardTx });
  }

  console.log("\n  four categories, four live books on BNB Smart Chain mainnet\n");
  for (const o of opened) {
    console.log(`  ${CATEGORY_LABEL[o.category].padEnd(26)} mandate ${o.id}`);
    console.log(`    open   https://bscscan.com/tx/${o.open}`);
    console.log(`    bid    https://bscscan.com/tx/${o.bid}`);
    console.log(`    award  https://bscscan.com/tx/${o.award}`);
  }
  console.log(`\n  ${JSON.stringify(opened.map((o) => ({ category: o.category, id: o.id })))}\n`);
}

main().catch((e) => {
  console.error("\n  FAILED:", e?.shortMessage ?? e?.message ?? e, "\n");
  process.exit(1);
});
