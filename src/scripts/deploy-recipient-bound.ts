/**
 * Deploys the RecipientBound wrapper for one principal and one agent.
 *
 * This is the contract that turns "target and selector bound" into "recipient
 * bound". A session key grants four bytes and an address; it cannot pin an
 * argument, so PancakeSwap's `mint` and `collect` are granted with whatever
 * recipient the holder passes. The wrapper writes the recipient itself, from
 * immutable storage, and the session is granted on the wrapper instead of on
 * the position manager. There is then no argument left to abuse.
 *
 *   npm run recipient-bound -- --agent 0x… [--principal 0x…] [--cap 0.05] [--ttl 30d]
 *
 * After it lands, set RECIPIENT_BOUND (and NEXT_PUBLIC_RECIPIENT_BOUND) to the
 * address. Until that is set, the published allowlist reports the binding as
 * pending rather than claiming a contract that does not exist, which is the
 * only honest thing a document can say about an undeployed address.
 *
 * The principal must then, from their own wallet, once:
 *   - approve the wrapper for the two ERC-20s it will pull, and
 *   - setApprovalForAll on the position manager, so it may act on positions
 *     the principal owns.
 * Revoking either ends the wrapper's usefulness without the wrapper's consent,
 * which is deliberate: the second kill switch is not ours to hold.
 */

import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { PROTOCOLS } from "@/lib/config";

const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);

const RPC = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";
const KEY = process.env.PRIVATE_KEY;

/** WBNB / USDT on BSC, the pair the rebalancing job actually runs. */
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as Address;
const USDT = "0x55d398326f99059fF775485246999027B3197955" as Address;

function duration(v: string): number {
  const m = v.match(/^(\d+(?:\.\d+)?)([dhms])?$/);
  if (!m) throw new Error(`cannot read "${v}" as a duration; use 30d, 12h, 90m or seconds`);
  return Math.round(Number(m[1]) * { d: 86_400, h: 3_600, m: 60, s: 1 }[(m[2] ?? "s") as "d" | "h" | "m" | "s"]);
}

function artifact() {
  const json = JSON.parse(
    readFileSync("contracts/out/RecipientBound.sol/RecipientBound.json", "utf8"),
  ) as { abi: unknown[]; bytecode: { object: string } };
  return { abi: json.abi, bytecode: json.bytecode.object as `0x${string}` };
}

async function main() {
  if (!KEY) {
    console.error("set PRIVATE_KEY: the principal deploys its own wrapper.");
    process.exit(2);
  }
  const agent = flag("agent") as Address | undefined;
  if (!agent || !/^0x[0-9a-fA-F]{40}$/.test(agent)) {
    console.error("usage: npm run recipient-bound -- --agent 0x… [--principal 0x…] [--cap 0.05] [--ttl 30d]");
    console.error("  --agent is the session key's wallet: the only address permitted to call.");
    process.exit(1);
  }

  const account = privateKeyToAccount((KEY.startsWith("0x") ? KEY : `0x${KEY}`) as `0x${string}`);
  const principal = (flag("principal") as Address | undefined) ?? account.address;
  const cap = BigInt(Math.round(Number(flag("cap") ?? "0.05") * 1e18));
  const expiry = BigInt(Math.floor(Date.now() / 1000) + duration(flag("ttl") ?? "30d"));

  const publicClient = createPublicClient({ chain: bsc, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: bsc, transport: http(RPC) });
  const { abi, bytecode } = artifact();

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`deployer   ${account.address}`);
  console.log(`balance    ${(Number(balance) / 1e18).toFixed(6)} BNB`);
  console.log(`principal  ${principal}   (receives everything, immutable)`);
  console.log(`agent      ${agent}   (the only caller)`);
  console.log(`pair       WBNB / USDT`);
  console.log(`cap        ${(Number(cap) / 1e18).toFixed(4)} of each token`);
  console.log(`expires    ${new Date(Number(expiry) * 1000).toISOString()}`);

  if (balance === 0n) {
    console.error("\nno BNB to pay for the deployment. Nothing was sent.");
    process.exit(1);
  }

  const hash = await wallet.deployContract({
    abi,
    bytecode,
    args: [
      principal,
      agent,
      PROTOCOLS.pancakeV3PositionManager as Address,
      // token0 must be the lower address, matching the pool's ordering.
      WBNB.toLowerCase() < USDT.toLowerCase() ? WBNB : USDT,
      WBNB.toLowerCase() < USDT.toLowerCase() ? USDT : WBNB,
      cap,
      cap,
      expiry,
    ],
  });
  console.log(`\ndeploying  ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`deployed   ${receipt.contractAddress}`);
  console.log(`block      ${receipt.blockNumber}`);
  console.log(`\nhttps://bscscan.com/address/${receipt.contractAddress}#code`);
  console.log(`\nNext, in .env.local:`);
  console.log(`  RECIPIENT_BOUND=${receipt.contractAddress}`);
  console.log(`  NEXT_PUBLIC_RECIPIENT_BOUND=${receipt.contractAddress}`);
  console.log(`\nThen verify it, so the ticket's link resolves to readable source:`);
  console.log(
    `  cd contracts && forge verify-contract ${receipt.contractAddress} src/RecipientBound.sol:RecipientBound \\\n` +
      `    --chain 56 --watch --constructor-args $(cast abi-encode \\\n` +
      `    "constructor(address,address,address,address,address,uint256,uint256,uint64)" \\\n` +
      `    ${principal} ${agent} ${PROTOCOLS.pancakeV3PositionManager} ${WBNB.toLowerCase() < USDT.toLowerCase() ? WBNB : USDT} ${WBNB.toLowerCase() < USDT.toLowerCase() ? USDT : WBNB} ${cap} ${cap} ${expiry})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
