/**
 * Resolves a contested slash using the public verifier's own arithmetic.
 *
 * The gap this closes. v2 already makes reporting an alpha cost a stake and
 * lets anyone contradict it — but the *resolution* was ours to make, by
 * whatever reasoning we liked. An adjudicator who resolves challenges with
 * different arithmetic from the verifier it publishes is running two sets of
 * books, and the published one is decoration.
 *
 * So the decision is not made here. It is read out of `mandate-verify`, the
 * same package anyone can run against mainnet from a clean machine, which
 * imports nothing from this application and is enforced not to. If the
 * verifier says the settlement holds, the slash is upheld. If the verifier
 * finds a failure, the slash is voided and the bond goes back to the agent. If
 * the verifier cannot reach a conclusion, **nothing is resolved** — because an
 * adjudicator that breaks ties in its own favour when the evidence is missing
 * is exactly the party this market was built to remove.
 *
 *   npx tsx src/scripts/resolve-challenge.ts --mandate 1 --epoch 0
 *   npx tsx src/scripts/resolve-challenge.ts --mandate 1 --epoch 0 --broadcast
 */

import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { verifyMandate } from "../../packages/mandate-verify/src/verify";

const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const broadcast = args.includes("--broadcast");

const mandateId = Number(flag("--mandate") ?? NaN);
const epoch = Number(flag("--epoch") ?? NaN);
const market = (flag("--market") ?? process.env.MARKET_ADDRESS) as Address | undefined;
const RPC = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";
const CHAIN = Number(process.env.CHAIN_ID ?? 56);

const MARKET_ABI = [
  {
    type: "function",
    name: "resolveSlash",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }, { type: "uint32" }, { type: "bool" }],
    outputs: [],
  },
  {
    type: "function",
    name: "pendingSlash",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "uint32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "amount", type: "uint96" },
          { name: "claimableAt", type: "uint64" },
          { name: "agent", type: "address" },
          { name: "contested", type: "bool" },
          { name: "resolved", type: "bool" },
        ],
      },
    ],
  },
] as const;

async function main() {
  if (!Number.isInteger(mandateId) || !Number.isInteger(epoch)) {
    console.error("usage: resolve-challenge --mandate <n> --epoch <n> [--market 0x..] [--broadcast]");
    process.exit(2);
  }
  if (!market) {
    console.error("--market or MARKET_ADDRESS is required");
    process.exit(2);
  }

  const client = createPublicClient({ chain: bsc, transport: http(RPC) });

  const slash = (await client.readContract({
    address: market,
    abi: MARKET_ABI,
    functionName: "pendingSlash",
    args: [BigInt(mandateId), epoch],
  })) as { amount: bigint; agent: Address; contested: boolean; resolved: boolean };

  console.log(`market    ${market}`);
  console.log(`mandate   ${mandateId} epoch ${epoch}`);
  console.log(`slash     ${(Number(slash.amount) / 1e18).toFixed(8)} BNB against ${slash.agent}`);
  console.log(`state     ${slash.resolved ? "resolved" : slash.contested ? "contested" : "pending"}`);

  if (slash.amount === 0n) {
    console.log("\nnothing to resolve: no slash was taken for this epoch");
    process.exit(0);
  }
  if (slash.resolved) {
    console.log("\nalready resolved");
    process.exit(0);
  }

  console.log("\nasking the public verifier, not ourselves…");
  const result = await verifyMandate({
    chainId: CHAIN,
    mandateId,
    market,
    rpc: RPC,
    archive: process.env.ARCHIVE_RPC_URL || undefined,
  });

  console.log(`verifier  tier ${result.tier}, ${result.failures.length} failures, ${result.unresolved.length} unresolved`);
  for (const f of result.failures) console.log(`  ✗ ${f}`);
  for (const u of result.unresolved) console.log(`  ? ${u}`);

  /*
    Tier 0 means nothing was established, in either direction.

    This guard exists because the first version of this script did not have it,
    and the first dry run against a real pending slash would have VOIDED it —
    returned the agent's bond — on the strength of five "failures" that were
    all of the form *no log found*. A provider that refuses to serve a range
    and a range that genuinely contains nothing look identical from here, and
    this codebase has already shipped that bug once, in this very package.

    So absence is never a verdict. The verifier has to have reached tier 1 —
    the observations found, hashing to their commitments — before its opinion
    counts in either direction.
  */
  if (result.tier === 0) {
    console.log(
      "\nNOT RESOLVING. The verifier reached tier 0: it did not find the" +
        "\nobservations at all, which is a statement about what the node would" +
        `\nserve (${result.logGaps} gaps across ${result.logWindows} windows) and not` +
        "\nabout the settlement. Absence is not evidence of a wrong slash any more" +
        "\nthan it is evidence of a right one." +
        "\n\nSupply --rpc with a node that serves eth_getLogs over a range, or" +
        "\n--archive for older epochs, and run this again.",
    );
    process.exit(3);
  }

  if (result.unresolved.length > 0) {
    console.log(
      "\nNOT RESOLVING. The verifier could not reach part of the evidence, and an" +
        "\nadjudicator that settles on missing evidence is deciding, not checking.",
    );
    process.exit(3);
  }

  const upheld = result.ok && result.failures.length === 0;
  console.log(
    `\ndecision  ${upheld ? "UPHELD — the settlement re-derives, the slash stands" : "VOIDED — the verifier contradicts the settlement, the bond returns to the agent"}`,
  );

  if (!broadcast) {
    console.log("\ndry run. Pass --broadcast to submit.");
    return;
  }

  const key = process.env.PRIVATE_KEY;
  if (!key) {
    console.error("PRIVATE_KEY is required to submit the resolution");
    process.exit(2);
  }
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
  const wallet = createWalletClient({ account, chain: bsc, transport: http(RPC) });

  const hash = await wallet.writeContract({
    address: market,
    abi: MARKET_ABI,
    functionName: "resolveSlash",
    args: [BigInt(mandateId), epoch, upheld],
    chain: bsc,
    account,
  });
  console.log(`\nsubmitted https://bscscan.com/tx/${hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
