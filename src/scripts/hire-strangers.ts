/**
 * Pays ERC-8004 agents we do not operate to take a job, through ERC-8183.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/hire-strangers.ts [run] [tokenId ...]
 *
 * This is Altana's `hireErc8183Agent`, called from the principal's own Altana
 * account: one batch that creates the job, registers it with the router, sets
 * the budget, approves exactly the budget and funds the escrow, in $U. The
 * provider is the agent's own address as the ERC-8004 registry reports it,
 * checked against every address we control before anything is sent.
 *
 * A funded job is escrow, not payment: the provider is paid when it submits
 * and the job settles; if it never submits, the budget comes back to us after
 * expiry through `claimRefund`. The record says which of those happened,
 * read from the job itself, never assumed.
 *
 * Targets: Agripinaa's Ranger, AgentCensus's monitor, Muster's range check,
 * and the agent `pick-trophy.ts` draws from a block hash.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatEther, parseAbi, parseEther, type Address, type Hex } from "viem";
import { marketChain, marketClient, walletFor } from "@/lib/chain/market";
import { gasPrice } from "@/lib/chain/marketV2";
import { IDENTITY_REGISTRY } from "@/lib/config";
import { DEMO_ADDRESS } from "@/lib/demo";

const MODE = process.argv[2] === "run" ? "run" : "plan";
const ONLY = process.argv.slice(3).filter((a) => /^\d+$/.test(a));
const OUT = join(process.cwd(), "src/data/hires.json");

export const U_TOKEN: Address = "0xcE24439F2D9C6a2289F741120FE202248B666666";
const V2_ROUTER: Address = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const WBNB: Address = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const BUDGET = parseEther("0.1");

const OURS = new Set(
  [
    DEMO_ADDRESS,
    "0xd6d11Aa5046dc5C7BE8d63B9223b60D7AD94cBe9",
    "0x090d19610cdb4d6bb011d9EB579910Ac3296BB0a",
    "0x6F29B50ebaF733D980EadfeB3253347d8a12A69C",
    "0xd9E5837E28F1C36e591aff7869CE177c71C7F4A4",
    "0x004c7Ae8077560c75fE5687dA39E7bE0697ddBFD",
    "0xbebF6B026e1fFC06A3c8d3C1b57b8142BF027454",
    "0x7e91367c77E561F0d99C2B42925aF29cd90AE838",
    "0x81762d5214fCB6fB3b102beF9D69d13A56c1a2d0",
  ].map((a) => a.toLowerCase()),
);

const REGISTRY_ABI = parseAbi([
  "function ownerOf(uint256) view returns (address)",
  "function getAgentWallet(uint256) view returns (address)",
]);
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const ROUTER = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable",
]);

interface Target {
  tokenId: string;
  who: string;
  task: string;
}

function targets(): Target[] {
  const base: Target[] = [
    {
      tokenId: "269706",
      who: "Agripinaa Ranger",
      task: `Check PancakeSwap V3 position #7408923 on BNB Smart Chain (owner ${DEMO_ADDRESS}) and say whether it should be recentered, with the pool tick you read. Deliverable: a JSON verdict with the block number.`,
    },
    {
      tokenId: "270183",
      who: "AgentCensus Health Factor Monitor",
      task: `Report the Venus health factor of ${DEMO_ADDRESS} on BNB Smart Chain, with the block number and the markets it holds. Deliverable: JSON.`,
    },
    {
      tokenId: "342379",
      who: "Muster, PancakeSwap LP Range Check",
      task: `Read PancakeSwap V3 position #7408925 (owner ${DEMO_ADDRESS}) and report its distance from each bound and whether to hold, widen or recentre. Deliverable: JSON.`,
    },
  ];
  const pickPath = join(process.cwd(), "src/data/trophy-pick.json");
  if (existsSync(pickPath)) {
    const p = JSON.parse(readFileSync(pickPath, "utf8")) as { picked: { tokenId: string; name: string | null } | null; seedBlock: number };
    if (p.picked) {
      base.push({
        tokenId: p.picked.tokenId,
        who: `${p.picked.name ?? "unnamed agent"} (drawn by the hash of block ${p.seedBlock})`,
        task: `Describe what your service does for a wallet on BNB Smart Chain and run it once for ${DEMO_ADDRESS}. Deliverable: the output, with the block number.`,
      });
    }
  }
  return ONLY.length ? base.filter((t) => ONLY.includes(t.tokenId)) : base;
}

async function providerOf(tokenId: string): Promise<{ provider: Address; owner: Address; via: string }> {
  const owner = (await marketClient.readContract({ address: IDENTITY_REGISTRY as Address, abi: REGISTRY_ABI, functionName: "ownerOf", args: [BigInt(tokenId)] })) as Address;
  const wallet = (await marketClient
    .readContract({ address: IDENTITY_REGISTRY as Address, abi: REGISTRY_ABI, functionName: "getAgentWallet", args: [BigInt(tokenId)] })
    .catch(() => null)) as Address | null;
  const usable = wallet && !/^0x0{40}$/i.test(wallet) ? wallet : null;
  return { provider: usable ?? owner, owner, via: usable ? "the registry's agent wallet" : "the registry's ownerOf" };
}

async function main() {
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error("PRIVATE_KEY is required");
  const pk = (key.startsWith("0x") ? key : `0x${key}`) as Hex;
  const admin = walletFor(pk);
  const me = admin.account!.address;
  const list = targets();

  const [bnb, u, quote] = await Promise.all([
    marketClient.getBalance({ address: me }),
    marketClient.readContract({ address: U_TOKEN, abi: ERC20, functionName: "balanceOf", args: [me] }),
    marketClient.readContract({ address: V2_ROUTER, abi: ROUTER, functionName: "getAmountsOut", args: [parseEther("0.001"), [WBNB, U_TOKEN]] }).catch(() => null),
  ]);
  const uPerBnb = quote ? Number(quote[1]) / 1e18 / 0.001 : null;
  console.log(`principal ${me}: ${formatEther(bnb)} BNB, ${formatEther(u)} $U; the V2 pool gives ${uPerBnb?.toFixed(2) ?? "?"} $U per BNB`);

  const resolved = [];
  for (const t of list) {
    const p = await providerOf(t.tokenId);
    const ours = OURS.has(p.provider.toLowerCase()) || OURS.has(p.owner.toLowerCase());
    console.log(`#${t.tokenId} ${t.who}: provider ${p.provider} (${p.via}), owner ${p.owner}${ours ? "  REFUSED: that is one of ours" : ""}`);
    if (!ours) resolved.push({ ...t, ...p });
  }
  const needU = BUDGET * BigInt(resolved.length);
  console.log(`needs ${formatEther(needU)} $U for ${resolved.length} jobs of ${formatEther(BUDGET)} each`);
  if (MODE !== "run") {
    console.log("plan only. Re-run with `run`.");
    return;
  }

  if (u < needU) {
    if (!uPerBnb) throw new Error("no $U quote from the V2 pool");
    const short = needU - u;
    const bnbIn = parseEther(((Number(short) / 1e18 / uPerBnb) * 1.08).toFixed(8));
    const minOut = (short * 95n) / 100n;
    const hash = await admin.writeContract({
      address: V2_ROUTER,
      abi: ROUTER,
      functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
      args: [minOut, [WBNB, U_TOKEN], me, BigInt(Math.floor(Date.now() / 1000) + 900)],
      value: bnbIn,
      chain: marketChain,
      account: admin.account!,
      gasPrice: await gasPrice(),
    });
    await marketClient.waitForTransactionReceipt({ hash });
    console.log(`swapped ${formatEther(bnbIn)} BNB for $U: ${hash}`);
  }

  const sdk = (await import("@altananetwork/sdk")) as unknown as {
    BNB: unknown;
    signerFromPrivateKey: (k: Hex) => unknown;
    hireErc8183Agent: (wallet: { address: Address }, signer: unknown, params: { provider: Address; task: string; budget: bigint }, opts: { network: unknown }) => Promise<{ jobId: bigint; transactionHash?: Hex; status: string; expiredAt: bigint }>;
    getErc8183Job: (network: unknown, jobId: bigint) => Promise<Record<string, unknown>>;
  };
  const signer = sdk.signerFromPrivateKey(pk);
  const history = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as { hires: unknown[] }) : { hires: [] };

  for (const t of resolved) {
    try {
      const r = await sdk.hireErc8183Agent({ address: me }, signer, { provider: t.provider, task: t.task, budget: BUDGET }, { network: sdk.BNB });
      const job = await sdk.getErc8183Job(sdk.BNB, r.jobId).catch(() => null);
      const entry = {
        tokenId: t.tokenId,
        who: t.who,
        provider: t.provider,
        providerVia: t.via,
        ownerOf: t.owner,
        oursChecked: [...OURS],
        jobId: r.jobId.toString(),
        tx: r.transactionHash ?? null,
        budget: formatEther(BUDGET),
        token: "$U",
        expiredAt: Number(r.expiredAt),
        statusAtHire: job ? String(job.status ?? job.state ?? "") : null,
        task: t.task,
        at: new Date().toISOString(),
      };
      history.hires.push(entry);
      writeFileSync(OUT, JSON.stringify(history, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
      console.log(`hired #${t.tokenId}: job ${r.jobId} tx ${r.transactionHash ?? "(no hash)"} status ${entry.statusAtHire}`);
    } catch (e) {
      console.log(`#${t.tokenId} failed: ${String((e as { details?: string }).details ?? (e as Error).message).slice(0, 300)}`);
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
