/**
 * Registers MANDATE as an ERC-8004 agent on BNB Smart Chain.
 *
 * This project points its instrument at three hundred thousand registrations
 * and grades them on whether the thing they point at actually exists. Standing
 * outside that instrument is the one position it cannot defend, so it registers
 * itself and takes whatever rung it earns. If the endpoint stops answering the
 * fineness drops and the site shows it, with no exemption available.
 *
 * Dry by default. `--broadcast` sends the transaction.
 *
 *   npx tsx src/scripts/register-self.ts
 *   npx tsx src/scripts/register-self.ts --broadcast
 */

import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { CHAIN_ID, IDENTITY_REGISTRY } from "@/lib/config";

const args = process.argv.slice(2);
const broadcast = args.includes("--broadcast");
const HOST = process.env.NEXT_PUBLIC_HOST ?? "https://mandate-coral.vercel.app";
const RPC = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";

/**
 * The registration, in the schema the registry actually stores.
 *
 * Read off a live registration rather than assumed: `tokenURI` returns a
 * base64 `data:` URI holding this JSON, so the record is self-contained and
 * needs no external host to stay resolvable.
 *
 * Written to be tested, not to score. Every claim here is one this project's
 * own assay will check within minutes, and a card that overstated its skills
 * would fail its author's capability check in public.
 */
function registration() {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "MANDATE Assay Office",
    description:
      "Tests ERC-8004 agents against BNB Smart Chain and publishes the evidence. Six checks — identity, custody, activity, capability, reputation, performance — produce a millesimal fineness; below 375 no hallmark is struck. The assay is a free public API open to anyone, including competing marketplaces. Every finding carries the command that re-derives it. This agent is listed in its own register at whatever rung it earns.",
    image: `${HOST}/icon.svg`,
    services: [
      { name: "web", endpoint: HOST },
      { name: "A2A", endpoint: `${HOST}/.well-known/agent-card.json` },
      { name: "API", endpoint: `${HOST}/api/v1` },
      {
        name: "OASF",
        endpoint: "https://github.com/agntcy/oasf/",
        version: "0.8.0",
        skills: [
          "evaluation_and_monitoring/quality_evaluation",
          "evaluation_and_monitoring/performance_monitoring",
          "retrieval_augmented_generation/document_retrieval",
        ],
        domains: [
          "technology/blockchain",
          "technology/artificial_intelligence",
          "financial_services/risk_management",
        ],
      },
    ],
  };
}

const REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenURI", type: "string" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

async function main() {
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    console.error("PRIVATE_KEY is required (the address that will own the registration)");
    process.exit(2);
  }
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
  const publicClient = createPublicClient({ chain: bsc, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain: bsc, transport: http(RPC) });

  const json = JSON.stringify(registration());
  const tokenURI = `data:application/json;base64,${Buffer.from(json).toString("base64")}`;

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`owner     ${account.address}`);
  console.log(`balance   ${(Number(balance) / 1e18).toFixed(6)} BNB`);
  console.log(`registry  ${IDENTITY_REGISTRY} (chain ${CHAIN_ID})`);
  console.log(`card      ${json.length} bytes of JSON, ${tokenURI.length} as a data URI`);

  // Simulated first, always. A registration is permanent and public; finding
  // out it reverts after paying for it is not a discovery worth making.
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
  const gasPrice = await publicClient.getGasPrice();
  const cost = gas * gasPrice;

  console.log(`\nsimulated ok — would mint token ${result}`);
  console.log(`gas       ${gas} at ${Number(gasPrice) / 1e9} gwei = ${(Number(cost) / 1e18).toFixed(6)} BNB`);

  if (!broadcast) {
    console.log("\ndry run. Nothing was sent. Pass --broadcast to register.");
    return;
  }

  if (balance < cost * 2n) {
    console.error(`\nrefusing to broadcast: balance ${(Number(balance) / 1e18).toFixed(6)} BNB is under twice the estimate`);
    process.exit(3);
  }

  const hash = await wallet.writeContract(request);
  console.log(`\nsent      https://bscscan.com/tx/${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`mined     block ${receipt.blockNumber}, status ${receipt.status}`);
  console.log(`\nMANDATE is now an ERC-8004 agent on BSC, subject to its own instrument.`);
  console.log(`Assay it: ${HOST}/api/v1/assay/${CHAIN_ID}/${result}`);
  console.log(`\nadd to .env.local:\n  MANDATE_TOKEN_ID=${result}\n  NEXT_PUBLIC_MANDATE_TOKEN_ID=${result}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
