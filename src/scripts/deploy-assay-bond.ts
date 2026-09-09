/**
 * Deploys AssayBond and, optionally, strikes the first bonded hallmark.
 *
 * Every mark this contract holds escrows real BNB that anyone can take by
 * showing the mark was wrong. That is the point, and it is also why this is a
 * separate deliberate step rather than something the adjudicator does on its
 * own: the office should have to decide, each time, that it is willing to be
 * wrong in public and pay for it.
 *
 *   npx tsx src/scripts/deploy-assay-bond.ts --bond 0.05 --window 259200
 *   npx tsx src/scripts/deploy-assay-bond.ts --strike 304493 --fineness 405
 */

import { createPublicClient, createWalletClient, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const RPC = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";
const KEY = process.env.ADJUDICATOR_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;
const EXISTING = flag("--at") ?? process.env.ASSAY_BOND_ADDRESS;

const bondEther = flag("--bond") ?? "0.05";
const windowSeconds = BigInt(flag("--window") ?? 3 * 24 * 60 * 60);

function artifact() {
  const raw = readFileSync("contracts/out/AssayBond.sol/AssayBond.json", "utf8");
  const json = JSON.parse(raw) as { abi: unknown[]; bytecode: { object: string } };
  return { abi: json.abi, bytecode: json.bytecode.object as `0x${string}` };
}

async function main() {
  if (!KEY) {
    console.error("set ADJUDICATOR_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) to deploy or strike");
    process.exit(2);
  }
  const account = privateKeyToAccount(
    (KEY.startsWith("0x") ? KEY : `0x${KEY}`) as `0x${string}`,
  );
  const publicClient = createPublicClient({ chain: bsc, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: bsc, transport: http(RPC) });
  const { abi, bytecode } = artifact();

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`deployer ${account.address}`);
  console.log(`balance  ${(Number(balance) / 1e18).toFixed(6)} BNB`);

  let address = EXISTING as Address | undefined;

  if (!address) {
    const bond = parseEther(bondEther);
    console.log(`\ndeploying AssayBond — bond ${bondEther} BNB, window ${windowSeconds}s`);
    const hash = await wallet.deployContract({
      abi,
      bytecode,
      args: [account.address, bond, windowSeconds],
    } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    address = receipt.contractAddress!;
    console.log(`deployed ${address}`);
    console.log(`tx       https://bscscan.com/tx/${hash}`);
    console.log(`\nadd to .env.local:\n  ASSAY_BOND_ADDRESS=${address}\n  NEXT_PUBLIC_ASSAY_BOND_ADDRESS=${address}`);
  }

  const strikeToken = flag("--strike");
  if (!strikeToken) {
    console.log("\nno --strike given; nothing was bonded.");
    return;
  }

  const fineness = Number(flag("--fineness") ?? 0);
  const agent = flag("--agent") as Address | undefined;
  const owner = flag("--owner") as Address | undefined;
  const assayBlock = BigInt(flag("--block") ?? (await publicClient.getBlockNumber()));
  const assayHash = (flag("--hash") ?? `0x${"0".repeat(64)}`) as `0x${string}`;

  if (fineness < 375) {
    // The bar is the bar. Nothing below it is struck anywhere in this system,
    // and a bond behind an unstruck mark would be money backing nothing.
    console.error(`fineness ${fineness} is below 375; nothing is struck and nothing is bonded`);
    process.exit(3);
  }
  if (!agent || !owner) {
    console.error("--agent and --owner are required to strike: the mark commits both");
    process.exit(2);
  }

  const required = (await publicClient.readContract({
    address: address!,
    abi,
    functionName: "bondRequired",
  })) as bigint;

  console.log(`\nstriking ${strikeToken} at ${fineness}, escrowing ${(Number(required) / 1e18).toFixed(4)} BNB`);
  const hash = await wallet.writeContract({
    address: address!,
    abi,
    functionName: "strike",
    args: [BigInt(strikeToken), agent, owner, fineness, assayBlock, assayHash],
    value: required,
  } as never);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`struck   https://bscscan.com/tx/${hash}`);
  console.log(`\nAnyone may now take that bond by showing the mark is wrong.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
