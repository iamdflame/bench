/**
 * Puts the demo address into the state `/judges` describes.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/demo-inventory.ts [run]
 *
 * The judge pastes one address and must see, from chain: an out-of-range
 * PancakeSwap V3 position, a Venus account with a visible health factor, and
 * idle cash. The address is the principal (`PRIVATE_KEY`), which is also the
 * Altana account that grants sessions, so the same address is later the
 * subject of the recenter and the passkey proofs.
 *
 * Three positions are minted on WBNB/USDT 0.05%, all single-sided so no swap
 * is needed. NFT-A sits about 16% below the price (all WBNB) and NFT-C about
 * 16% above it (all USDT): whichever way BNB moves, at least one of them is
 * out of range, so the paste target never goes quiet. NFT-B sits just below
 * the price and is the one Range-1 recenters. A Venus account is opened by
 * supplying a little USDT and borrowing a little BNB.
 *
 * Everything is micro-sized and everything is real. Amounts and the resulting
 * token ids are written to `src/data/demo.json` with the block.
 */

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { encodeFunctionData, formatEther, parseAbi, parseEther, parseUnits, type Address, type Hex } from "viem";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { gasPrice } from "@/lib/chain/marketV2";

const MODE = process.argv[2] === "run" ? "run" : "plan";
/** `run venus`: the positions exist; finish (or redo) only the Venus leg. */
const VENUS_ONLY = process.argv[3] === "venus";
const OUT = join(process.cwd(), "src/data/demo.json");

export const POOL: Address = "0x36696169C63e42cd08ce11f5deeBbCeBae652050"; // WBNB/USDT 0.05%
export const NPM: Address = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
export const USDT: Address = "0x55d398326f99059fF775485246999027B3197955"; // token0
export const WBNB: Address = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"; // token1
export const VUSDT: Address = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
export const VBNB: Address = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
export const COMPTROLLER: Address = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const FEE = 500;
const SPACING = 10;

const POOL_ABI = parseAbi(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint32,bool)"]);
const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function deposit() payable",
  "function transfer(address,uint256) returns (bool)",
]);
const NPM_ABI = parseAbi([
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
  "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
]);
const VENUS = parseAbi([
  "function mint(uint256) returns (uint256)",
  "function borrow(uint256) returns (uint256)",
  "function enterMarkets(address[]) returns (uint256[])",
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  "function borrowBalanceStored(address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function balanceOfUnderlying(address) returns (uint256)",
]);

const NFT_A_WBNB = parseEther("0.0002");
const NFT_B_WBNB = parseEther("0.0003");
const NFT_C_USDT = parseUnits("0.1", 18);
const VENUS_SUPPLY_USDT = parseUnits("0.25", 18);
/*
  USDT, not BNB. The demo address is an EIP-7702 delegated account, and
  receiving native BNB costs it about 26,300 gas, above the 2,300 stipend
  that vBNB's payout uses (`transfer`). A BNB borrow reverts with empty data;
  a USDT borrow is an ERC-20 transfer and works. Measured, not assumed:
  eth_call of vBNB.borrow reverts, vUSDT.borrow returns 0.
*/
const VENUS_BORROW_USDT = parseUnits("0.08", 18);

const floorTick = (t: number) => Math.floor(t / SPACING) * SPACING;

async function main() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY is required");
  const wallet = walletFor((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const me = wallet.account!.address;
  const price = await gasPrice();

  const [slot, bnb, usdt, wbnb] = await Promise.all([
    marketClient.readContract({ address: POOL, abi: POOL_ABI, functionName: "slot0" }),
    marketClient.getBalance({ address: me }),
    marketClient.readContract({ address: USDT, abi: ERC20, functionName: "balanceOf", args: [me] }),
    marketClient.readContract({ address: WBNB, abi: ERC20, functionName: "balanceOf", args: [me] }),
  ]);
  const tick = Number(slot[1]);
  const a = { lower: floorTick(tick - 1700), upper: floorTick(tick - 1500) };
  const b = { lower: floorTick(tick - 400), upper: floorTick(tick - 200) };
  const c = { lower: floorTick(tick + 1500), upper: floorTick(tick + 1700) };
  console.log(`demo address ${me}`);
  console.log(`pool tick ${tick}; NFT-A [${a.lower}, ${a.upper}) and NFT-B [${b.lower}, ${b.upper}) below (WBNB), NFT-C [${c.lower}, ${c.upper}) above (USDT)`);
  console.log(`holds ${formatEther(bnb)} BNB, ${formatEther(usdt)} USDT, ${formatEther(wbnb)} WBNB; gas ${Number(price) / 1e9} gwei`);

  const wrapNeeded = NFT_A_WBNB + NFT_B_WBNB > wbnb ? NFT_A_WBNB + NFT_B_WBNB - wbnb : 0n;
  console.log(`plan: wrap ${formatEther(wrapNeeded)} BNB, approve WBNB and USDT to the position manager, mint three positions (NFT-C takes ${formatEther(NFT_C_USDT)} USDT), supply ${formatEther(VENUS_SUPPLY_USDT)} USDT to Venus, borrow ${formatEther(VENUS_BORROW_USDT)} USDT`);
  if (!VENUS_ONLY && usdt < VENUS_SUPPLY_USDT + NFT_C_USDT) console.log(`  the address needs ${formatEther(VENUS_SUPPLY_USDT + NFT_C_USDT - usdt)} more USDT for the Venus leg (move it from keeper A first)`);
  if (MODE !== "run") {
    console.log("plan only. Re-run with `run` to send.");
    return;
  }

  const txs: Record<string, Hex> = {};
  const sendRaw = async (label: string, to: Address, data: Hex, value = 0n) => {
    const hash = await wallet.sendTransaction({ account: wallet.account!, chain: marketChain, to, data, value, gasPrice: price });
    const r = await marketClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    txs[label] = hash;
    console.log(`${label}: ${hash} (gas ${r.gasUsed})`);
    return r;
  };

  const previous = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as Record<string, unknown>) : {};
  let positions = previous.positions as Record<string, unknown> | undefined;
  if (!VENUS_ONLY) {
  if (wrapNeeded > 0n) await sendRaw("wrap", WBNB, encodeFunctionData({ abi: ERC20, functionName: "deposit" }), wrapNeeded);
  for (const [name, token] of [["approve-wbnb", WBNB], ["approve-usdt", USDT]] as const) {
    const allowance = await marketClient.readContract({ address: token, abi: ERC20, functionName: "allowance", args: [me, NPM] });
    if (allowance < parseEther("1")) {
      await sendRaw(name, token, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [NPM, parseEther("1000")] }));
    }
  }

  const mint = async (label: string, range: { lower: number; upper: number }, amount1: bigint, amount0 = 0n) => {
    const data = encodeFunctionData({
      abi: NPM_ABI,
      functionName: "mint",
      args: [{ token0: USDT, token1: WBNB, fee: FEE, tickLower: range.lower, tickUpper: range.upper, amount0Desired: amount0, amount1Desired: amount1, amount0Min: 0n, amount1Min: 0n, recipient: me, deadline: BigInt(Math.floor(Date.now() / 1000) + 600) }],
    });
    const r = await sendRaw(label, NPM, data);
    // IncreaseLiquidity(tokenId indexed ...) is the NPM's own event; the Transfer to `me` names the token id.
    const transfer = r.logs.find((l) => l.address.toLowerCase() === NPM.toLowerCase() && l.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
    const tokenId = transfer ? BigInt(transfer.topics[3]!) : 0n;
    return { tokenId: Number(tokenId), tx: r.transactionHash, block: Number(r.blockNumber), range };
  };
  const nftA = await mint("mint-nft-a", a, NFT_A_WBNB);
  const nftB = await mint("mint-nft-b", b, NFT_B_WBNB);
  const nftC = await mint("mint-nft-c", c, 0n, NFT_C_USDT);
  console.log(`NFT-A #${nftA.tokenId}  NFT-B #${nftB.tokenId}  NFT-C #${nftC.tokenId}`);
  positions = { outOfRangeBelow: nftA, outOfRangeAbove: nftC, recenterTarget: nftB };
  }

  // Venus: supply USDT, enter the market, borrow a little USDT. Each step
  // is skipped when the chain says it is already done, so a rerun resumes.
  const [vTokens, debt] = await Promise.all([
    marketClient.readContract({ address: VUSDT, abi: VENUS, functionName: "balanceOf", args: [me] }),
    marketClient.readContract({ address: VUSDT, abi: VENUS, functionName: "borrowBalanceStored", args: [me] }),
  ]);
  if (vTokens === 0n) {
    const vAllowance = await marketClient.readContract({ address: USDT, abi: ERC20, functionName: "allowance", args: [me, VUSDT] });
    if (vAllowance < VENUS_SUPPLY_USDT) await sendRaw("approve-usdt-venus", USDT, encodeFunctionData({ abi: ERC20, functionName: "approve", args: [VUSDT, parseEther("1000")] }));
    await sendRaw("venus-supply", VUSDT, encodeFunctionData({ abi: VENUS, functionName: "mint", args: [VENUS_SUPPLY_USDT] }));
    await sendRaw("venus-enter", COMPTROLLER, encodeFunctionData({ abi: VENUS, functionName: "enterMarkets", args: [[VUSDT]] }));
  }
  if (debt === 0n) {
    await sendRaw("venus-borrow", VUSDT, encodeFunctionData({ abi: VENUS, functionName: "borrow", args: [VENUS_BORROW_USDT] }));
  }
  const [, liquidity, shortfall] = await marketClient.readContract({ address: COMPTROLLER, abi: VENUS, functionName: "getAccountLiquidity", args: [me] });
  const venus = { opened: true, collateral: "USDT (vUSDT)", suppliedUsdt: formatEther(VENUS_SUPPLY_USDT), debt: "USDT", borrowedUsdt: formatEther(VENUS_BORROW_USDT), liquidityUsd: formatEther(liquidity), shortfallUsd: formatEther(shortfall) };

  const block = Number(await marketClient.getBlockNumber());
  const record = {
    ...previous,
    address: me,
    pool: POOL,
    positions,
    venus,
    txs: { ...((previous.txs as Record<string, string>) ?? {}), ...txs },
    tickAtMint: (previous.tickAtMint as number | undefined) ?? tick,
    block,
    at: new Date().toISOString(),
    verify: `cast call ${NPM} "positions(uint256)" ${(positions as { outOfRangeBelow: { tokenId: number } }).outOfRangeBelow.tokenId} --rpc-url https://bsc-rpc.publicnode.com`,
  };
  writeFileSync(OUT, JSON.stringify(record, null, 2) + "\n");
  console.log(`written ${OUT}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
