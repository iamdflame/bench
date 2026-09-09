/**
 * Registers the house agents as ERC-8004 identities on BNB Smart Chain.
 *
 * This closes the discontinuity the funnel has been narrating against itself.
 * The market's top rungs are occupied by two bare wallets: they hold mandates,
 * settle epochs against benchmarks committed before the outcome, and have been
 * slashed — but they are not registry entries, so rung 5 counted addresses and
 * the ladder had to say that the registry's population and the market's "do
 * not yet overlap at all". A marketplace whose only bonded participants sit
 * outside the registry it indexes is a studio with a directory attached.
 *
 * Each registration is minted *by the wallet that holds the mandates*, so the
 * token id and the holder are the same key. Nothing is transferred and nothing
 * is claimed on another wallet's behalf.
 *
 * One identity per wallet, not one per office. 0xd6d11Aa5 holds mandates in
 * all four offices; minting four registrations for it would make rung 5 read
 * `4` for one participant, which is the manufactured plurality this register
 * flags when it finds forty-four tokens on one BORT wallet. The card names
 * every office the wallet works in and the count stays honest.
 *
 * Dry by default. Nothing is sent without `--broadcast`.
 *
 *   npx tsx src/scripts/register-house.ts
 *   npx tsx src/scripts/register-house.ts --broadcast
 */

import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { IDENTITY_REGISTRY } from "@/lib/config";
import { HOUSE, type HouseAgent } from "@/lib/house";

const broadcast = process.argv.includes("--broadcast");
const HOST = process.env.NEXT_PUBLIC_HOST ?? "https://mandate-coral.vercel.app";
const RPC = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";

const REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenURI", type: "string" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * The keys, by the wallet they control.
 *
 * A registration must be minted by the mandate holder itself or the join is
 * cosmetic — a token owned by one address describing another address's record.
 * So the script refuses rather than substituting a key it does have.
 */
function keyFor(agent: HouseAgent): `0x${string}` | null {
  const candidates = [process.env.AGENT_A_KEY, process.env.AGENT_B_KEY, process.env.PRIVATE_KEY];
  for (const raw of candidates) {
    if (!raw) continue;
    const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
    try {
      if (privateKeyToAccount(key).address.toLowerCase() === agent.wallet.toLowerCase()) {
        return key;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  const publicClient = createPublicClient({ chain: bsc, transport: http(RPC) });
  const gasPrice = await publicClient.getGasPrice();

  console.log(`registry  ${IDENTITY_REGISTRY} on chain 56`);
  console.log(`gas price ${Number(gasPrice) / 1e9} gwei`);
  console.log(`mode      ${broadcast ? "BROADCAST" : "dry run"}\n`);

  let total = 0n;

  for (const agent of HOUSE) {
    console.log(`── ${agent.name}`);
    console.log(`   wallet   ${agent.wallet}`);
    console.log(`   offices  ${agent.offices.join(", ")}`);

    if (agent.tokenId) {
      console.log(`   already registered as ${agent.tokenId} — skipped\n`);
      continue;
    }

    const key = keyFor(agent);
    if (!key) {
      console.log(
        `   NO KEY for this wallet. The registration must be minted by the holder\n` +
          `   itself or the join is cosmetic. Skipped.\n`,
      );
      continue;
    }

    const account = privateKeyToAccount(key);
    const balance = await publicClient.getBalance({ address: account.address });

    // The card is served at a URL rather than inlined, because the card has to
    // name the token id and the token id does not exist until this transaction
    // has landed. The endpoint reads it from the environment afterwards.
    const tokenURI = `${HOST}/house/${agent.slug}/agent-card.json`;
    console.log(`   card     ${tokenURI}`);

    // Simulated first, always. A registration is permanent and public, and
    // finding out it reverts after paying for it is not a discovery worth
    // making.
    const { request, result } = await publicClient.simulateContract({
      address: IDENTITY_REGISTRY as Address,
      abi: REGISTRY_ABI,
      functionName: "register",
      args: [tokenURI],
      account,
    });

    const gas = await publicClient.estimateContractGas({
      address: IDENTITY_REGISTRY as Address,
      abi: REGISTRY_ABI,
      functionName: "register",
      args: [tokenURI],
      account,
    });
    const cost = gas * gasPrice;
    total += cost;

    console.log(`   balance  ${(Number(balance) / 1e18).toFixed(7)} BNB`);
    console.log(
      `   cost     ${gas} gas = ${(Number(cost) / 1e18).toFixed(7)} BNB` +
        `${balance < cost ? "  ← INSUFFICIENT" : ""}`,
    );
    console.log(`   would mint token ${result}`);

    if (!broadcast) {
      console.log(`   dry run — nothing sent\n`);
      continue;
    }

    const wallet = createWalletClient({ account, chain: bsc, transport: http(RPC) });
    const hash = await wallet.writeContract(request);
    console.log(`   sent     ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`   status   ${receipt.status} in block ${receipt.blockNumber}`);
    console.log(`   token    ${result}`);
    console.log(
      `   → set NEXT_PUBLIC_HOUSE_${agent.slug === "keeper-a" ? "A" : "B"}_TOKEN_ID=${result}\n`,
    );
  }

  console.log(`total ${(Number(total) / 1e18).toFixed(7)} BNB`);
  if (!broadcast) console.log("\nNothing was sent. Pass --broadcast to register.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
