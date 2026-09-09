/**
 * An agent earning the authority it will be granted.
 *
 *   npm run earn-capability -- grid-trading
 *
 * `granted ⊆ proven` derives a session's allowlist from the protocols the
 * chain has shown an agent using. Our own agent had used none of them, so it
 * was refused — correctly. This is the other half of that loop: the agent
 * performs one real, minimal interaction with the protocol its category needs,
 * and the authority becomes derivable because the evidence now exists.
 *
 * The order matters and is the point. Capability first, authority second.
 */

import { encodeFunctionData, formatEther, parseAbi, parseEther, type Address, type Hex } from "viem";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { CATEGORY_EVIDENCE, PROTOCOL_LABEL, type Category } from "@/lib/config";
import { scopeFromChain, isRefused } from "@/lib/chain/scope";

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const agent = walletFor(norm(process.env.AGENT_A_KEY));
const owner = walletFor(norm(process.env.PRIVATE_KEY));
const ME = agent.account!.address;

const V3_ROUTER = "0x13f4ea83d0bd40e75c8222255bc855a974568dd4" as const;
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
const USDT = "0x55d398326f99059fF775485246999027B3197955" as const;

/**
 * The V3 router, through multicall.
 *
 * A bare `exactInputSingle` with native value reverts with empty data after
 * consuming its whole gas budget: the router never wraps the BNB, so the pool
 * callback finds no WBNB to pay with. The supported shape for native input is
 * `multicall(deadline, [exactInputSingle, refundETH])`, where the router wraps
 * `msg.value` up front and returns the remainder at the end.
 *
 * It has to be V3 specifically. The agent proved V2 usage a moment ago and was
 * still refused, correctly — `grid.ts` calls the V3 router, so V3 is the
 * capability that has to be demonstrated. Evidence of using a different venue
 * does not transfer.
 */
const ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function refundETH() payable",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
]);

/**
 * Venus, for the yield and health-factor categories.
 *
 * vBNB itself emits nothing in an ordinary window — measured, zero logs across
 * 4,000 blocks — but the Comptroller emits a supplier-indexed distribution
 * event on every mint, which is what the capability scan actually sees.
 */
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36" as const;
const VBNB_ABI = parseAbi(["function mint() payable"]);

const category = (process.argv[2] ?? "grid-trading") as Category;
const AMOUNT = parseEther(process.env.EARN_AMOUNT ?? "0.0004");

console.log(`\n  agent    ${ME}`);
console.log(`  category ${category}`);
console.log(`  needs    ${CATEGORY_EVIDENCE[category].map((a) => PROTOCOL_LABEL[a] ?? a).join(", ")}\n`);

const before = await scopeFromChain(ME as Address, category);
console.log(
  isRefused(before)
    ? `  before   REFUSED — ${before.reason}`
    : `  before   ${before.rationale}`,
);

if (!isRefused(before)) {
  console.log(`\n  nothing to earn: authority is already derivable.\n`);
  process.exit(0);
}

if (category !== "grid-trading" && category !== "yield-optimisation" && category !== "health-factor") {
  console.error(`\n  ${category} is not wired here yet.\n`);
  process.exit(1);
}

const viaVenus = category === "yield-optimisation" || category === "health-factor";

// Top the agent up if it cannot cover the swap and its gas.
const gasPrice = await marketClient.getGasPrice();
const need = AMOUNT + gasPrice * 400_000n;
let balance = await marketClient.getBalance({ address: ME });
if (balance < need) {
  const top = need - balance + parseEther("0.0005");
  console.log(`\n  agent is short; sending ${formatEther(top)} BNB from the principal`);
  const h = await owner.sendTransaction({
    account: owner.account!,
    chain: marketChain,
    to: ME,
    value: top,
  });
  await marketClient.waitForTransactionReceipt({ hash: h });
  balance = await marketClient.getBalance({ address: ME });
  console.log(`  agent balance ${formatEther(balance)} BNB`);
}

if (viaVenus) {
  console.log(`\n  supplying ${formatEther(AMOUNT)} BNB to Venus vBNB`);
  try {
    await marketClient.simulateContract({
      address: VBNB,
      abi: VBNB_ABI,
      functionName: "mint",
      value: AMOUNT,
      account: agent.account!,
    });
  } catch (e) {
    console.error(`\n  simulation reverted, nothing sent:\n  ${String(e).slice(0, 220)}\n`);
    process.exit(1);
  }
  const h = await agent.writeContract({
    address: VBNB,
    abi: VBNB_ABI,
    functionName: "mint",
    value: AMOUNT,
    chain: marketChain,
    account: agent.account!,
  });
  const rr = await marketClient.waitForTransactionReceipt({ hash: h });
  console.log(`  ${rr.status === "success" ? "supplied" : "REVERTED"}  https://bscscan.com/tx/${h}`);
  if (rr.status !== "success") process.exit(1);

  console.log(`\n  re-deriving scope from the chain…`);
  const now = await scopeFromChain(ME as Address, category);
  if (isRefused(now)) {
    console.log(`  after    still refused — ${now.reason}`);
    console.log(`  (the log index may not have caught up; re-run in a moment)\n`);
    process.exit(3);
  }
  console.log(`  after    ${now.rationale}`);
  for (const c of now.calls) console.log(`    ${c.to}  ${c.signature}`);
  console.log();
  process.exit(0);
}

const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
const swapData = encodeFunctionData({
  abi: ROUTER_ABI,
  functionName: "exactInputSingle",
  args: [
    {
      tokenIn: WBNB,
      tokenOut: USDT,
      fee: 500,
      recipient: ME as Address,
      amountIn: AMOUNT,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    },
  ],
});
const refundData = encodeFunctionData({ abi: ROUTER_ABI, functionName: "refundETH" });
const args = [deadline, [swapData, refundData]] as const;

console.log(`\n  swapping ${formatEther(AMOUNT)} BNB for USDT through the V3 router`);

// Simulated first: a revert here costs nothing, a revert on chain costs gas.
try {
  await marketClient.simulateContract({
    address: V3_ROUTER,
    abi: ROUTER_ABI,
    functionName: "multicall",
    args,
    value: AMOUNT,
    account: agent.account!,
  });
} catch (e) {
  console.error(`\n  simulation reverted, so nothing was sent:\n  ${String(e).slice(0, 260)}\n`);
  process.exit(1);
}

const hash = await agent.writeContract({
  address: V3_ROUTER,
  abi: ROUTER_ABI,
  functionName: "multicall",
  args,
  value: AMOUNT,
  chain: marketChain,
  account: agent.account!,
});
const r = await marketClient.waitForTransactionReceipt({ hash });
console.log(`  ${r.status === "success" ? "swapped" : "REVERTED"}  https://bscscan.com/tx/${hash}`);
if (r.status !== "success") process.exit(1);

console.log(`\n  re-deriving scope from the chain…`);
const after = await scopeFromChain(ME as Address, category);
if (isRefused(after)) {
  console.log(`  after    still refused — ${after.reason}`);
  console.log(`  (the log index may not have caught up; re-run in a moment)\n`);
  process.exit(3);
}
console.log(`  after    ${after.rationale}`);
console.log(`\n  the agent may now be granted:`);
for (const c of after.calls) console.log(`    ${c.to}  ${c.signature}`);
for (const w of after.withheld) console.log(`    withheld ${w.signature.split("(")[0]} — ${w.because}`);
console.log();
