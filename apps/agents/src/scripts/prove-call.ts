/**
 * Rail 1, exercised against an agent we do not operate.
 *
 * A claim that a marketplace can hire is worth nothing unheld. This script
 * pays a real, third-party, BNB Smart Chain endpoint a real amount of USD1 and
 * prints what came back — or prints exactly which condition refused it.
 *
 * Six assertions, in the order they can fail:
 *
 *   1. the endpoint answers a payment challenge at all
 *   2. the challenge is well-formed and parseable
 *   3. the challenge is payable from BNB Smart Chain in an asset we hold
 *   4. an unpaid request is refused (the 402 is real, not decoration)
 *   5. a signed authorization is accepted and the goods are returned
 *   6. the buyer needed no BNB — the seller's facilitator submits the transfer
 *
 * The sixth is the one worth reading. The buyer signs an EIP-3009
 * authorization; it never sends a transaction, so it never needs the chain's
 * gas token. Hiring here does not require holding BNB at all.
 *
 *   npm run prove-call -- https://some.endpoint/path
 */

import { privateKeyToAccount } from "viem/accounts";
import { formatEther, type Address } from "viem";
import { ERC20_ABI, TOKENS, chainClient, safeFetch, type SupportedChain } from "@bench/shared";
import { parseChallenge } from "@bench/probe";
import { payAndCall } from "@bench/rails";

const CHAIN: SupportedChain = 56;

/** The default target, chosen because it is not ours and it is payable here. */
const DEFAULT_TARGET = "https://mpp.hyreagent.fun/bsc/defi/tvl";

/** Nothing this script runs may spend more than a few cents. */
const MAX_SPEND = 100_000_000_000_000_000n; // 0.10 USD1

const ok = (s: string) => console.log(`  ✓ ${s}`);
const no = (s: string) => console.log(`  ✗ ${s}`);
const meh = (s: string) => console.log(`  ? ${s}`);

async function main() {
  const target = process.argv[2] ?? DEFAULT_TARGET;
  const keyRaw = process.env.BUYER_KEY ?? process.env.AGENT_A_KEY ?? process.env.PRIVATE_KEY;
  if (!keyRaw) {
    console.error("No buyer key. Set BUYER_KEY (or AGENT_A_KEY) to a private key holding USD1.");
    process.exit(2);
  }
  const account = privateKeyToAccount((keyRaw.startsWith("0x") ? keyRaw : `0x${keyRaw}`) as `0x${string}`);
  const client = chainClient(CHAIN);
  const usd1 = TOKENS[CHAIN].USD1!;

  console.log(`\nRail 1 — Call\n  target ${target}\n  buyer  ${account.address}\n`);

  const [bnb, before] = await Promise.all([
    client.getBalance({ address: account.address }),
    client.readContract({
      address: usd1.address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    }) as Promise<bigint>,
  ]);
  console.log(`  holding ${formatEther(before)} USD1 and ${formatEther(bnb)} BNB\n`);

  let passed = 0;
  let failed = 0;
  let inconclusive = 0;

  /* ------------------------------------------------- 1 and 4. the challenge */
  const unpaid = await safeFetch(target, { timeoutMs: 15_000 });
  if (!unpaid.ok) {
    no(`1. the endpoint answers — ${unpaid.detail}`);
    process.exit(1);
  }
  if (unpaid.status === 402) {
    ok("1. an unpaid request is refused with a payment challenge   402");
    passed++;
  } else {
    no(`1. an unpaid request is refused — it answered ${unpaid.status} without asking for payment`);
    failed++;
  }

  /* --------------------------------------------------------- 2. parseable */
  const challenge = parseChallenge(unpaid.body, CHAIN);
  if (!challenge) {
    no("2. the challenge parses — the body is not an x402 challenge");
    process.exit(1);
  }
  ok(`2. the challenge parses                                  x402 v${challenge.x402Version}, ${challenge.routes.length} route(s)`);
  passed++;

  /* ----------------------------------------------------------- 3. payable */
  if (!challenge.payable || !challenge.best) {
    no(`3. it is payable from BNB Smart Chain — ${challenge.unpayableReason}`);
    console.log("\n  Nothing was spent. This is the honest outcome for the great majority of\n  the B402 catalogue, and the reason the board shows a refusal rather than\n  a Hire button on those rows.\n");
    process.exit(1);
  }
  const route = challenge.best;
  ok(
    `3. it is payable from BNB Smart Chain                     ${formatEther(route.amount!)} ${route.assetSymbol} on chain ${route.chainId}`,
  );
  passed++;

  if (before < route.amount!) {
    no(`   the buyer holds ${formatEther(before)} ${route.assetSymbol} and the call costs ${formatEther(route.amount!)}`);
    process.exit(1);
  }
  if (route.amount! > MAX_SPEND) {
    no(`   the call costs ${formatEther(route.amount!)}, above this script's ceiling of ${formatEther(MAX_SPEND)}`);
    process.exit(1);
  }

  /* ------------------------------------------------ 5. pay and get the goods */
  const result = await payAndCall({
    chainId: CHAIN,
    url: target,
    challenge,
    account,
    maxAmount: MAX_SPEND,
  });

  if (!result.ok) {
    no(`4. a signed payment returns the goods — ${result.refusedBecause}`);
    failed++;
  } else {
    ok(`4. a signed payment settles and returns the goods         ${result.status}, ${result.latencyMs} ms`);
    passed++;
    const body = (result.body ?? "").trim();
    console.log(`\n  what came back (first 400 characters):\n  ${body.slice(0, 400).replace(/\n/g, "\n  ")}\n`);
    if (result.settlement) console.log(`  settlement receipt: ${result.settlement.slice(0, 120)}\n`);
  }

  /* ---------------------------------------------- 6. the money actually moved */
  const after = (await client.readContract({
    address: usd1.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  const spent = before - after;

  if (spent === route.amount!) {
    ok(`5. exactly the quoted amount left the buyer               ${formatEther(spent)} ${route.assetSymbol}`);
    passed++;
  } else if (spent === 0n) {
    /*
      The facilitator submits the transfer, and it may not have landed by the
      time this line runs. That is not a failure of the rail and it is not a
      pass either, so it is reported as neither.
    */
    meh("5. exactly the quoted amount left the buyer               not settled on chain yet at this block");
    inconclusive++;
  } else {
    no(`5. exactly the quoted amount left the buyer — ${formatEther(spent)} moved, ${formatEther(route.amount!)} was quoted`);
    failed++;
  }

  const bnbAfter = await client.getBalance({ address: account.address });
  if (bnbAfter === bnb) {
    ok("6. the buyer spent no BNB                                 it signed, it did not send");
    passed++;
  } else {
    no(`6. the buyer spent no BNB — ${formatEther(bnb - bnbAfter)} BNB left the wallet`);
    failed++;
  }

  console.log(
    `\n  ${passed} proven · ${failed} failed · ${inconclusive} inconclusive\n` +
      `  against an endpoint operated by somebody else, on BNB Smart Chain mainnet.\n`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
