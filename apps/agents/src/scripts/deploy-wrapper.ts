/**
 * Deploy a `RecipientBound` for one principal, and record it where the site
 * can render it.
 *
 * ---------------------------------------------------------------------------
 * Why this contract exists at all
 * ---------------------------------------------------------------------------
 *
 * A session key binds a target and four selector bytes. It cannot bind an
 * *argument*. PancakeSwap's position manager takes `recipient` as an argument
 * on `mint` and `collect`, so granting those selectors grants them with any
 * destination the hired agent chooses. The largest agent shop on this chain
 * published exactly this about their own product: their custody boundary rests
 * on account isolation rather than on recipient binding.
 *
 * So the session is not granted on the position manager. It is granted on this
 * wrapper, whose `mint` and `collect` have **no recipient parameter** — the
 * destination is written from immutable storage. There is nothing to pass,
 * because the argument is not in the interface.
 *
 * ---------------------------------------------------------------------------
 * On principal and agent being the same address
 * ---------------------------------------------------------------------------
 *
 * Under an Altana session the call executes *from the principal's own smart
 * account*, so `msg.sender` at the wrapper is the principal. `agent` and
 * `principal` are therefore the same address, and that is correct rather than
 * degenerate: the party being constrained is the **session key**, which may
 * only call the four functions below, and none of them lets it name a
 * destination. The wrapper is per-principal by design — its own source says so.
 *
 *   npm run deploy:wrapper -- --pair WBNB/USDT --cap 0.05 --days 365
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createWalletClient, createPublicClient, http, parseEther, formatEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TOKENS, VENUES, confirm, receiptRpcUrls, viemChain, addressUrl, type SupportedChain } from "@bench/shared";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const ARTIFACT = join(ROOT, "contracts/out/RecipientBound.sol/RecipientBound.json");
const RECORD = join(ROOT, "apps/web/data/wrappers.json");

interface WrapperRecord {
  chainId: number;
  address: Address;
  principal: Address;
  agent: Address;
  positionManager: Address;
  token0: Address;
  token1: Address;
  pair: string;
  cap0: string;
  cap1: string;
  expiry: number;
  deployTx: string;
  block: number;
  deployedAt: string;
  /** Everything a third party needs to reproduce the bytecode themselves. */
  verify: { compiler: string; optimizer: boolean; runs: number; constructorArgs: string[] };
}

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
}

async function main() {
  const chainId = Number(arg("chain", "56")) as SupportedChain;
  const capText = arg("cap", "0.05");
  const days = Number(arg("days", "365"));
  const pairName = arg("pair", "WBNB/USDT");

  const key = process.env.PRINCIPAL_KEY ?? process.env.PRIVATE_KEY;
  if (!key) {
    console.error("\n  No principal key. Set PRINCIPAL_KEY (or PRIVATE_KEY) to the account this wrapper pays back to.\n");
    process.exit(2);
  }
  if (!existsSync(ARTIFACT)) {
    console.error("\n  No compiled artifact. Run `npm run contracts:build` first.\n");
    process.exit(2);
  }

  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const chain = viemChain(chainId);
  /*
    Two clients, because the hosts differ by method.

    The chain's default list is led by the host that serves ranged logs, and
    that host refuses `eth_getTransactionReceipt` outright. Confirming a deploy
    on it reports a contract that landed as a failure — which is exactly what
    happened the first time this ran.
  */
  const pub = createPublicClient({ chain, transport: http(receiptRpcUrls(chainId)[0]) });
  const wallet = createWalletClient({ account, chain, transport: http(receiptRpcUrls(chainId)[0]) });

  const t = TOKENS[chainId];
  const [aName, bName] = pairName.split("/") as [keyof typeof t, keyof typeof t];
  const ta = t[aName];
  const tb = t[bName];
  if (!ta || !tb) {
    console.error(`\n  Unknown pair "${pairName}" on chain ${chainId}.\n`);
    process.exit(2);
  }

  /*
    PancakeSwap orders a pool's tokens by address, and the wrapper pulls
    `token0` and `token1` in that order. Sorting here rather than trusting the
    argument order means a pair written the other way round still produces a
    wrapper that works against the real pool.
  */
  const [token0, token1] =
    ta.address.toLowerCase() < tb.address.toLowerCase()
      ? [ta.address, tb.address]
      : [tb.address, ta.address];

  const cap = parseEther(capText);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + days * 86_400);

  const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8")) as {
    abi: unknown[];
    bytecode: { object: Hex };
    metadata?: string;
  };

  const args = [
    account.address, // principal — receives everything, immutable
    account.address, // agent — the caller; under a session this is the same account
    VENUES.pancakeV3PositionManager as Address,
    token0,
    token1,
    cap,
    cap,
    expiry,
  ] as const;

  console.log(`\ndeploying RecipientBound on chain ${chainId}\n`);
  console.log(`  principal        ${account.address}`);
  console.log(`  agent            ${account.address}  (the session executes from this account)`);
  console.log(`  position manager ${VENUES.pancakeV3PositionManager}`);
  console.log(`  token0           ${token0}`);
  console.log(`  token1           ${token1}`);
  console.log(`  cap each         ${capText}`);
  console.log(`  expires          ${new Date(Number(expiry) * 1000).toISOString()}  (${days} days)\n`);

  const balance = await pub.getBalance({ address: account.address });
  const gasPrice = await pub.getGasPrice();
  console.log(`  balance ${formatEther(balance)} BNB · gas price ${gasPrice} wei\n`);

  const hash = await wallet.deployContract({
    abi: artifact.abi as never,
    bytecode: artifact.bytecode.object,
    args: args as never,
    chain,
    account,
  });
  console.log(`  submitted ${hash}`);

  const receipt = await confirm(chainId, hash, { timeoutMs: 180_000 });
  if (!receipt.ok) {
    console.error(`\n  ${receipt.why}\n`);
    process.exit(1);
  }
  if (receipt.status !== "success" || !receipt.contractAddress) {
    console.error(`\n  the deployment reverted. ${hash}\n`);
    process.exit(1);
  }

  const address = receipt.contractAddress;
  console.log(`  deployed  ${address}`);
  console.log(`  block     ${receipt.blockNumber}`);
  console.log(`  gas used  ${receipt.gasUsed} (${formatEther(receipt.gasUsed * gasPrice)} BNB)`);
  console.log(`  confirmed via ${receipt.via}\n`);

  /*
    Read the deployed contract back before recording it.

    A deployment receipt says a contract exists at an address. It does not say
    the constructor stored what was intended, and a wrapper that pays back to
    the wrong principal is the single worst bug this contract could have.
  */
  const { parseAbi } = await import("viem");
  const check = parseAbi([
    "function principal() view returns (address)",
    "function agent() view returns (address)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function cap0() view returns (uint256)",
    "function expiry() view returns (uint64)",
  ]);
  const [p, a, t0, t1, c0, ex] = await Promise.all([
    pub.readContract({ address, abi: check, functionName: "principal" }),
    pub.readContract({ address, abi: check, functionName: "agent" }),
    pub.readContract({ address, abi: check, functionName: "token0" }),
    pub.readContract({ address, abi: check, functionName: "token1" }),
    pub.readContract({ address, abi: check, functionName: "cap0" }),
    pub.readContract({ address, abi: check, functionName: "expiry" }),
  ]);

  const ok =
    p.toLowerCase() === account.address.toLowerCase() &&
    a.toLowerCase() === account.address.toLowerCase() &&
    t0.toLowerCase() === token0.toLowerCase() &&
    t1.toLowerCase() === token1.toLowerCase() &&
    c0 === cap &&
    ex === expiry;

  console.log("  read back from chain:");
  console.log(`    principal ${p}`);
  console.log(`    agent     ${a}`);
  console.log(`    token0    ${t0}`);
  console.log(`    token1    ${t1}`);
  console.log(`    cap0      ${formatEther(c0)}`);
  console.log(`    expiry    ${new Date(Number(ex) * 1000).toISOString()}`);
  console.log(ok ? "\n  ✓ the constructor stored exactly what was passed\n" : "\n  ✗ STORED STATE DOES NOT MATCH THE ARGUMENTS\n");
  if (!ok) process.exit(1);

  const record: WrapperRecord = {
    chainId,
    address,
    principal: p,
    agent: a,
    positionManager: VENUES.pancakeV3PositionManager as Address,
    token0: t0,
    token1: t1,
    pair: pairName,
    cap0: cap.toString(),
    cap1: cap.toString(),
    expiry: Number(expiry),
    deployTx: hash,
    block: Number(receipt.blockNumber),
    deployedAt: new Date().toISOString(),
    verify: {
      compiler: "0.8.28",
      optimizer: true,
      runs: 200,
      constructorArgs: args.map((x) => String(x)),
    },
  };

  const existing: WrapperRecord[] = existsSync(RECORD)
    ? (JSON.parse(readFileSync(RECORD, "utf8")) as WrapperRecord[])
    : [];
  mkdirSync(join(ROOT, "apps/web/data"), { recursive: true });
  writeFileSync(
    RECORD,
    JSON.stringify([...existing.filter((w) => w.address !== address), record], null, 1),
  );

  console.log(`  recorded in apps/web/data/wrappers.json`);
  console.log(`  ${addressUrl(chainId, address)}\n`);
  console.log(`  Set this in your environment so the hire screen can bind recipients:`);
  console.log(`    RECIPIENT_BOUND=${address}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
