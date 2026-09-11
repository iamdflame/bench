/**
 * Range-1 recenters an out-of-range position, through a session key, through
 * RecipientBound, and the NFT never changes hands.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/range-recenter.ts [run] [tokenId]
 *
 * What happens, in order, all on BNB Smart Chain:
 *
 *   1. The principal (the demo address) has approved RecipientBound for its
 *      positions and for up to the wrapper's caps of USDT and WBNB. Those are
 *      admin transactions, sent once, outside any session.
 *   2. A session is granted on the principal's Altana account whose entire
 *      allowlist is RecipientBound's four position calls, registered in the
 *      KeyStore. It cannot call the position manager directly, cannot call
 *      `approve`, cannot touch the identity registry.
 *   3. Through that session: decreaseLiquidity (all), collect, mint a new range
 *      around the current tick. `mint` and `collect` on RecipientBound have no
 *      recipient argument: the tokens and the new NFT go to the principal
 *      because the contract says so, not because the agent chose it.
 *   4. Checked on chain afterwards: the old NFT and the new NFT are both owned
 *      by the principal, and the new range contains the tick at the mint block.
 *
 * Evidence: `src/data/recenter.json`, and the session's execution list in the
 * session store (shown on /desk).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeEventLog, formatEther, parseAbi, parseUnits, type Abi, type Address, type Hex } from "viem";
import { marketClient } from "@/lib/chain/market";
import { getSession, grantScopedSession, providerFor } from "@/lib/chain/session";
import { recordExecution } from "@/lib/chain/session-store";
import { comparePolicy } from "@/lib/chain/keystore";
import { closeDb } from "@/lib/db/client";

const MODE = process.argv[2] === "run" ? "run" : "plan";
const DEMO = join(process.cwd(), "src/data/demo.json");
const OUT = join(process.cwd(), "src/data/recenter.json");

export const RECIPIENT_BOUND = (process.env.RECIPIENT_BOUND ?? "0x5863edaede7394470db19395ca05b1439662952e") as Address;
const NPM: Address = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const POOL: Address = "0x36696169C63e42cd08ce11f5deeBbCeBae652050";
const USDT: Address = "0x55d398326f99059fF775485246999027B3197955";
const WBNB: Address = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const SPACING = 10;
const FEE = 500;
/** New range: 150 ticks below the price to 50 above, so most of it is the WBNB the old range held. */
const BELOW = 150;
const ABOVE = 50;
/** USDT this recenter may commit. RecipientBound's cap is cumulative, 0.05 for its life. */
const USDT_BUDGET = parseUnits("0.03", 18);

export const RB_ABI = parseAbi([
  "function mint(uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,uint256 deadline) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function increaseLiquidity(uint256 tokenId,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,uint256 deadline) returns (uint128 liquidity,uint256 amount0,uint256 amount1)",
  "function decreaseLiquidity(uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline) returns (uint256 amount0,uint256 amount1)",
  "function collect(uint256 tokenId,uint128 amount0Max,uint128 amount1Max) returns (uint256 amount0,uint256 amount1)",
  "function principal() view returns (address)",
  "function agent() view returns (address)",
  "function expiry() view returns (uint64)",
  "function cap0() view returns (uint256)",
  "function cap1() view returns (uint256)",
  "function spent0() view returns (uint256)",
  "function spent1() view returns (uint256)",
  "event Minted(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

/** The whole allowlist a Range-1 session gets. Four selectors on one address. */
export const RANGE_CALLS = [
  { to: RECIPIENT_BOUND, signature: "mint(uint24,int24,int24,uint256,uint256,uint256,uint256,uint256)" },
  { to: RECIPIENT_BOUND, signature: "increaseLiquidity(uint256,uint256,uint256,uint256,uint256,uint256)" },
  { to: RECIPIENT_BOUND, signature: "decreaseLiquidity(uint256,uint128,uint256,uint256,uint256)" },
  { to: RECIPIENT_BOUND, signature: "collect(uint256,uint128,uint128)" },
];

const NPM_ABI = parseAbi([
  "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function ownerOf(uint256) view returns (address)",
  "function isApprovedForAll(address,address) view returns (bool)",
]);
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"]);
const POOL_ABI = parseAbi(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint32,bool)"]);

const floorTick = (t: number) => Math.floor(t / SPACING) * SPACING;
const MAX128 = (1n << 128n) - 1n;
const read = <T>(address: Address, abi: Abi, functionName: string, args: unknown[] = []) =>
  marketClient.readContract({ address, abi, functionName, args } as never) as Promise<T>;

async function main() {
  const demo = JSON.parse(readFileSync(DEMO, "utf8")) as { address: Address; positions: { recenterTarget: { tokenId: number } } };
  const tokenId = BigInt(process.argv[3] ?? demo.positions.recenterTarget.tokenId);
  const principal = demo.address;
  const sessionId = `house:range-1:${principal.toLowerCase()}`;

  const [rbPrincipal, rbAgent, rbExpiry, cap0, cap1, spent0, spent1] = await Promise.all([
    read<Address>(RECIPIENT_BOUND, RB_ABI, "principal"),
    read<Address>(RECIPIENT_BOUND, RB_ABI, "agent"),
    read<bigint>(RECIPIENT_BOUND, RB_ABI, "expiry"),
    read<bigint>(RECIPIENT_BOUND, RB_ABI, "cap0"),
    read<bigint>(RECIPIENT_BOUND, RB_ABI, "cap1"),
    read<bigint>(RECIPIENT_BOUND, RB_ABI, "spent0"),
    read<bigint>(RECIPIENT_BOUND, RB_ABI, "spent1"),
  ]);
  if (rbPrincipal.toLowerCase() !== principal.toLowerCase()) throw new Error(`RecipientBound's principal is ${rbPrincipal}, not the demo address`);
  if (rbAgent.toLowerCase() !== principal.toLowerCase()) throw new Error(`RecipientBound's agent is ${rbAgent}; sessions execute as the principal's account`);

  const [owner, pos, slot, approvedAll, allowUsdt, allowWbnb] = await Promise.all([
    read<Address>(NPM, NPM_ABI, "ownerOf", [tokenId]),
    read<readonly unknown[]>(NPM, NPM_ABI, "positions", [tokenId]),
    read<readonly unknown[]>(POOL, POOL_ABI, "slot0"),
    read<boolean>(NPM, NPM_ABI, "isApprovedForAll", [principal, RECIPIENT_BOUND]),
    read<bigint>(USDT, ERC20, "allowance", [principal, RECIPIENT_BOUND]),
    read<bigint>(WBNB, ERC20, "allowance", [principal, RECIPIENT_BOUND]),
  ]);
  const lower = Number(pos[5]);
  const upper = Number(pos[6]);
  const liquidity = pos[7] as bigint;
  const tick = Number(slot[1]);
  const outOfRange = tick < lower || tick >= upper;
  console.log(`position #${tokenId} owner ${owner}`);
  console.log(`  range [${lower}, ${upper}) liquidity ${liquidity} pool tick ${tick}: ${outOfRange ? "OUT of range" : "in range"}`);
  console.log(`RecipientBound ${RECIPIENT_BOUND}: principal = agent = ${rbPrincipal}; expiry ${new Date(Number(rbExpiry) * 1000).toISOString().slice(0, 10)}`);
  console.log(`  caps USDT ${formatEther(cap0)} (spent ${formatEther(spent0)}), WBNB ${formatEther(cap1)} (spent ${formatEther(spent1)})`);
  console.log(`  principal approvals: position NFTs ${approvedAll}, USDT ${formatEther(allowUsdt)}, WBNB ${formatEther(allowWbnb)}`);

  if (owner.toLowerCase() !== principal.toLowerCase()) throw new Error("the demo address does not own this position");
  if (liquidity === 0n) throw new Error("this position has no liquidity; nothing to recenter");
  if (!outOfRange) throw new Error("the position is in range; Range-1 does nothing to a position that is earning");
  if (!approvedAll || allowWbnb === 0n) throw new Error("the principal has not approved RecipientBound; send the three admin approvals first");

  const newLower = floorTick(tick - BELOW);
  const newUpper = floorTick(tick + ABOVE) + SPACING;
  console.log(`plan: decreaseLiquidity(${liquidity}) → collect → mint [${newLower}, ${newUpper}) around tick ${tick}, all through RecipientBound`);
  if (MODE !== "run") {
    console.log("plan only. Re-run with `run` to grant the session and send.");
    return;
  }

  // The session: reuse a live one, otherwise grant exactly four selectors.
  let rec = await getSession(sessionId);
  const live = rec && !rec.revokedAt && rec.expiry * 1000 > Date.now() + 3_600_000;
  if (!live) {
    console.log("granting the Range-1 session (KeyStore-registered)");
    rec = await grantScopedSession({
      id: sessionId,
      kind: "house",
      label: "Range-1 on the demo address",
      category: "rebalancing",
      calls: RANGE_CALLS,
      tokenSpend: [
        { token: USDT, limit: cap0 },
        { token: WBNB, limit: cap1 },
      ],
      nativeSpendWei: 2_000_000_000_000_000n,
      capWei: 0n,
      ttlSeconds: 7 * 24 * 3600,
      register: true,
      meta: { recipientBound: RECIPIENT_BOUND, target: tokenId.toString() },
    });
    console.log(`  session key ${rec.publicKey.slice(0, 18)}… registration ${rec.registrationTx ?? "(not found in logs)"}`);
  } else {
    console.log(`reusing live session ${sessionId}`);
  }
  const provider = await providerFor(sessionId);
  const executor = provider.makeExecutor({ client: marketClient });
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 900);

  const run = async (description: string, functionName: string, args: unknown[]) => {
    const r = (await executor.execute({ call: { address: RECIPIENT_BOUND, abi: RB_ABI as unknown as Abi, functionName, args }, description } as never)) as {
      transactionHash: Hex;
      receipt?: { status: string; blockNumber: bigint; logs: { address: string; topics: Hex[]; data: Hex }[] };
    };
    const receipt = r.receipt ?? (await marketClient.waitForTransactionReceipt({ hash: r.transactionHash }));
    if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${r.transactionHash}`);
    console.log(`  ${functionName}: ${r.transactionHash}`);
    await recordExecution(sessionId, { tx: r.transactionHash, description, status: "confirmed" }).catch(() => undefined);
    return { hash: r.transactionHash, receipt };
  };

  const dec = await run(`withdraw all liquidity from #${tokenId}, out of range at tick ${tick}`, "decreaseLiquidity", [tokenId, liquidity, 0n, 0n, deadline()]);
  const col = await run(`collect #${tokenId}'s tokens and fees to the principal`, "collect", [tokenId, MAX128, MAX128]);

  const [usdtBal, wbnbBal, s0, s1, slotNow] = await Promise.all([
    read<bigint>(USDT, ERC20, "balanceOf", [principal]),
    read<bigint>(WBNB, ERC20, "balanceOf", [principal]),
    read<bigint>(RECIPIENT_BOUND, RB_ABI, "spent0"),
    read<bigint>(RECIPIENT_BOUND, RB_ABI, "spent1"),
    read<readonly unknown[]>(POOL, POOL_ABI, "slot0"),
  ]);
  const tickNow = Number(slotNow[1]);
  const lo = floorTick(tickNow - BELOW);
  const hi = floorTick(tickNow + ABOVE) + SPACING;
  const min = (...xs: bigint[]) => xs.reduce((a, b) => (b < a ? b : a));
  const amount0 = min(USDT_BUDGET, cap0 - s0, usdtBal);
  const amount1 = min(wbnbBal, cap1 - s1);
  console.log(`  minting [${lo}, ${hi}) at tick ${tickNow} with up to ${formatEther(amount0)} USDT and ${formatEther(amount1)} WBNB`);
  const mint = await run(`mint a range around tick ${tickNow}; the NFT goes to the principal`, "mint", [FEE, lo, hi, amount0, amount1, 0n, 0n, deadline()]);

  let newTokenId: bigint | null = null;
  for (const log of mint.receipt.logs) {
    if (log.address.toLowerCase() !== RECIPIENT_BOUND.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: RB_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (ev.eventName === "Minted") newTokenId = (ev.args as { tokenId: bigint }).tokenId;
    } catch {
      /* not ours */
    }
  }
  if (newTokenId === null) throw new Error("mint landed but no Minted event was found");

  const [oldOwner, newOwner, newPos, slotAfter] = await Promise.all([
    read<Address>(NPM, NPM_ABI, "ownerOf", [tokenId]),
    read<Address>(NPM, NPM_ABI, "ownerOf", [newTokenId]),
    read<readonly unknown[]>(NPM, NPM_ABI, "positions", [newTokenId]),
    read<readonly unknown[]>(POOL, POOL_ABI, "slot0"),
  ]);
  const tickAfter = Number(slotAfter[1]);
  const inRange = tickAfter >= Number(newPos[5]) && tickAfter < Number(newPos[6]);
  const sameOwner = oldOwner.toLowerCase() === principal.toLowerCase() && newOwner.toLowerCase() === principal.toLowerCase();
  console.log(`\nold #${tokenId} owner ${oldOwner}\nnew #${newTokenId} owner ${newOwner} range [${newPos[5]}, ${newPos[6]}) liquidity ${newPos[7]} tick ${tickAfter}: ${inRange ? "IN range" : "out of range"}`);
  console.log(`same owner throughout: ${sameOwner}`);

  const policy = rec ? await comparePolicy({ wallet: principal, publicKey: rec.publicKey as Hex, expiry: rec.expiry, registered: rec.registered, revoked: false }) : null;
  const record = {
    agent: "Range-1",
    principal,
    recipientBound: RECIPIENT_BOUND,
    session: { id: sessionId, publicKey: rec?.publicKey, keyId: rec?.keyId, expiry: rec?.expiry, registrationTx: rec?.registrationTx, keystore: policy?.verdict },
    before: { tokenId: tokenId.toString(), range: [lower, upper], tick, liquidity: liquidity.toString(), owner },
    after: { tokenId: newTokenId.toString(), range: [Number(newPos[5]), Number(newPos[6])], tick: tickAfter, liquidity: String(newPos[7]), owner: newOwner, inRange },
    sameOwnerThroughout: sameOwner,
    txs: { decreaseLiquidity: dec.hash, collect: col.hash, mint: mint.hash },
    blocks: { decreaseLiquidity: Number(dec.receipt.blockNumber), collect: Number(col.receipt.blockNumber), mint: Number(mint.receipt.blockNumber) },
    at: new Date().toISOString(),
    verify: [
      `cast call ${NPM} "ownerOf(uint256)(address)" ${tokenId} --rpc-url https://bsc-rpc.publicnode.com`,
      `cast call ${NPM} "ownerOf(uint256)(address)" ${newTokenId} --rpc-url https://bsc-rpc.publicnode.com`,
    ],
  };
  const history = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as { runs?: unknown[] }) : {};
  writeFileSync(OUT, JSON.stringify({ latest: record, runs: [...(history.runs ?? []), record] }, null, 2) + "\n");
  console.log(`written ${OUT}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
