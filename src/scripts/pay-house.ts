/**
 * Buys one answer from a reference agent over x402, the way any client would.
 *
 *   npx tsx --env-file=.env --env-file-if-exists=.env.local src/scripts/pay-house.ts grid-1 [--base URL] [--query "wallet=0x..."]
 *
 * 1. GET with no payment: expect 402 and the terms.
 * 2. Sign an EIP-3009 transferWithAuthorization for the quoted USD1 amount,
 *    to the quoted payee, with AGENT_A_KEY (a wallet that holds USD1 and
 *    almost no BNB, which is the point: the buyer needs none).
 * 3. GET again with X-PAYMENT: expect 200, the work, and the settlement tx.
 */

import { toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";
import { TRANSFER_TYPES, USD1, USD1_DOMAIN } from "@/lib/x402";

const args = process.argv.slice(2);
const slug = args[0] ?? "grid-1";
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const BASE = (opt("base") ?? "https://mandate-coral.vercel.app").replace(/\/$/, "");
const QUERY = opt("query");
const url = `${BASE}/api/x402/house/${slug}${QUERY ? `?${QUERY}` : ""}`;

async function main() {
  const key = process.env.AGENT_A_KEY;
  if (!key) throw new Error("AGENT_A_KEY is required (the buyer)");
  const buyer = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);

  const first = await fetch(url);
  const terms = (await first.json()) as { accepts?: { payTo: Address; maxAmountRequired: string; asset: Address; network: string }[]; error?: string };
  console.log(`1. ${first.status} without payment${terms.error ? `: ${terms.error}` : ""}`);
  if (first.status !== 402 || !terms.accepts?.length) throw new Error("expected a 402 with terms");
  const req = terms.accepts[0];
  if (req.asset.toLowerCase() !== USD1.toLowerCase()) throw new Error(`asks for ${req.asset}, this buyer only pays USD1`);
  console.log(`   terms: ${Number(req.maxAmountRequired) / 1e18} USD1 to ${req.payTo} on ${req.network}`);

  const authorization = {
    from: buyer.address,
    to: req.payTo,
    value: BigInt(req.maxAmountRequired),
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 120),
    nonce: toHex(randomBytes(32)),
  };
  const signature = await buyer.signTypedData({ domain: USD1_DOMAIN, types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization", message: authorization });
  const header = Buffer.from(
    JSON.stringify({
      x402Version: 1,
      scheme: "exact",
      network: req.network,
      payload: {
        signature,
        authorization: { ...authorization, value: authorization.value.toString(), validAfter: "0", validBefore: authorization.validBefore.toString() },
      },
    }),
  ).toString("base64");

  const second = await fetch(url, { headers: { "X-PAYMENT": header } });
  const body = await second.json();
  const receipt = second.headers.get("x-payment-response");
  console.log(`2. ${second.status} with payment signed by ${buyer.address}`);
  if (receipt) console.log(`   settlement: ${JSON.parse(Buffer.from(receipt, "base64").toString()).transaction}`);
  console.log(JSON.stringify(body, null, 2).slice(0, 2500));
  if (second.status !== 200) process.exitCode = 1;
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
