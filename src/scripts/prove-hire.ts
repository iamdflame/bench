/**
 * The hire, proven on mainnet: open → bid → award.
 *
 * This exists because the marketplace's whole write path was dead. Every
 * transaction the site could send was built from the V1 ABI and addressed to
 * the V2 contract, so `simulateContract` reverted with `execution reverted: 0x`
 * before the wallet was ever asked for a signature. A user clicked, nothing
 * opened, and a grey button was the entire answer.
 *
 * Fixing that is only half of it. The other half is showing that the corrected
 * arities work against the deployed contract with real money, because a
 * simulation proves the calldata decodes and nothing more. So this drives the
 * three transactions that actually constitute a hire, at the smallest amounts
 * the market permits, and prints the hashes.
 *
 * It deliberately stops at `award`. Settlement is the adjudicator's job on its
 * own clock, and waiting an epoch here would turn a proof into a vigil.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/prove-hire.ts
 */

import { formatEther, parseEther, type Address, type Hex } from "viem";
import { MANDATE_MARKET_V2_ABI } from "@/lib/chain/abiV2";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { valueWallet } from "@/lib/chain/prices";

const V2 = (process.env.NEXT_PUBLIC_MARKET_ADDRESS ??
  "0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2") as Address;

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const principal = walletFor(norm(process.env.PRIVATE_KEY));
const agent = walletFor(norm(process.env.AGENT_B_KEY ?? process.env.AGENT_A_KEY));

/**
 * The smallest capital that still leaves a workable bond.
 *
 * `requiredBond` is the larger of the market's flat `minBond` (0.00004 BNB) and
 * a fifth of the capital. At 0.0002 those coincide, which makes this the
 * cheapest mandate an agent can actually bid on.
 */
const CAPITAL = parseEther("0.0002");

const NATIVE = "0x0000000000000000000000000000000000000000" as Address;
const bnb = (w: bigint) => `${Number(formatEther(w)).toFixed(8)} BNB`;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function read(fn: string, args: unknown[] = []) {
  return marketClient.readContract({
    address: V2,
    abi: MANDATE_MARKET_V2_ABI,
    functionName: fn,
    args,
  } as never);
}

async function send(
  w: ReturnType<typeof walletFor>,
  fn: string,
  args: unknown[],
  value?: bigint,
): Promise<Hex> {
  /*
    Simulated first, then sent — and deliberately not by spreading the
    simulation's own request into the write.

    `simulateContract` hands back a request whose `account` is an address. Give
    that to a wallet client talking to a public node and viem reaches for
    `eth_sendTransaction`, which no public node will serve. The local account
    has to be passed as the object it is, so the transaction is signed here and
    submitted as raw. The simulation is still worth running: a revert caught
    there costs nothing, and the same revert on chain costs gas and explains
    less.
  */
  await marketClient.simulateContract({
    address: V2,
    abi: MANDATE_MARKET_V2_ABI,
    functionName: fn,
    args,
    value,
    account: w.account!.address,
  } as never);

  const hash = await w.writeContract({
    address: V2,
    abi: MANDATE_MARKET_V2_ABI,
    functionName: fn,
    args,
    value,
    chain: marketChain,
    account: w.account!,
  } as never);
  const receipt = await marketClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") throw new Error(`${fn} reverted on chain`);
  return hash;
}

async function main() {
  if (marketChain.id !== 56) {
    throw new Error(`refusing: this is for BSC mainnet, chain is ${marketChain.id}`);
  }

  const p = principal.account!.address;
  const a = agent.account!.address;
  log(`principal ${p} · ${bnb(await marketClient.getBalance({ address: p }))}`);
  log(`agent     ${a} · ${bnb(await marketClient.getBalance({ address: a }))}`);

  if (await read("paused")) throw new Error("the market is paused");

  /* ---------------------------------------------------------------- open */
  const before = Number(await read("mandateCount"));
  const openTx = await send(
    principal,
    "openMandate",
    [
      1, // GridTrading
      NATIVE, // native BNB; `amount` below is ignored for native
      0n,
      0, // Benchmark.Hold
      200, // toleranceBps
      2_000, // feeBps
      2_500, // slashBps
      3_600, // epochLength — must exceed the 300s challenge window
      24, // epochsTotal
      3, // strikes — zero is refused
      -1_000, // catastrophic — must be negative
      2_000, // bondFloorBps — the agent posts a fifth of the capital
    ],
    CAPITAL,
  );
  const id = Number(await read("mandateCount")) - 1;
  if (Number(id) < before) throw new Error("no mandate was created");
  log(`opened   mandate ${id} · ${bnb(CAPITAL)} · ${openTx}`);

  /* ----------------------------------------------------------------- bid */
  const required = (await read("requiredBond", [BigInt(id)])) as bigint;
  const bond = (required * 125n) / 100n; // a little over, so rounding cannot refuse it
  log(`required bond ${bnb(required)}, posting ${bnb(bond)}`);

  const bidTx = await send(agent, "bid", [BigInt(id), 200, 0n, 0n], bond);
  log(`bid      ${bnb(bond)} at +2.00% per epoch · ${bidTx}`);

  /* --------------------------------------------------------------- award */
  const v = await valueWallet(a);
  if (v.weiTotal === 0n) {
    throw new Error("the agent wallet values at zero, and an opening mark of zero is refused");
  }
  const opening = {
    wallet: a,
    valuationWei: v.weiTotal,
    gasSpentWei: 0n,
    priceX96: v.sqrtPriceX96,
    blockNumber: v.blockNumber,
    breakdownRef: `0x${"0".repeat(64)}` as Hex,
    // Under `Hold` the benchmark is the opening value: it does not move, so
    // alpha reduces to the raw return.
    benchmarkWei: v.weiTotal,
  };

  const awardTx = await send(principal, "award", [BigInt(id), 0n, opening]);
  log(`awarded  opening mark ${bnb(v.weiTotal)} at block ${v.blockNumber} · ${awardTx}`);

  const m = (await read("getMandate", [BigInt(id)])) as { state: number; agent: Address };
  log(`state    ${m.state === 1 ? "Active" : m.state} · held by ${m.agent}`);

  console.log("\n  a hire, end to end, on BNB Smart Chain mainnet");
  console.log(`  mandate     ${id}`);
  console.log(`  open        https://bscscan.com/tx/${openTx}`);
  console.log(`  bid         https://bscscan.com/tx/${bidTx}`);
  console.log(`  award       https://bscscan.com/tx/${awardTx}\n`);
}

main().catch((e) => {
  console.error("\n  FAILED:", e?.shortMessage ?? e?.message ?? e, "\n");
  process.exit(1);
});
