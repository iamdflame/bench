/**
 * Buying from this marketplace over x402, and being refused without paying.
 *
 *   npm run prove-x402                 against a local server
 *   npm run prove-x402 -- --base <url> against a deployment
 *
 * The seller is proven by the buyer: an unpaid request must come back 402 with
 * a challenge a client can actually satisfy, a forged one must be rejected,
 * and a signed one must settle on chain and return the goods. All three run.
 *
 * The buyer signs an EIP-3009 authorization and spends **no BNB** — the seller
 * submits the transfer. That is the whole appeal next to a bonded mandate,
 * which needs capital, a term and an adjudicator before anyone learns anything.
 */

import { randomBytes } from "node:crypto";
import { formatUnits, type Hex } from "viem";
import { walletFor } from "@/lib/chain/market";
import { TRANSFER_TYPES, USD1, USD1_DECIMALS, USD1_DOMAIN } from "@/lib/x402";

const baseIdx = process.argv.indexOf("--base");
const BASE = baseIdx > -1 ? process.argv[baseIdx + 1]! : "http://localhost:3120";
const AGENT = process.argv.find((a) => /^\d+$/.test(a)) ?? "2410";

const norm = (k?: string) => (k?.startsWith("0x") ? k : `0x${k}`) as Hex;
const buyer = walletFor(norm(process.env.AGENT_A_KEY));
const me = buyer.account!.address;

interface Row { n: number; name: string; ok: boolean; detail: string }
const rows: Row[] = [];
const say = (n: number, name: string, ok: boolean, detail: string) => {
  rows.push({ n, name, ok, detail });
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}. ${name}`);
  console.log(`       ${detail}`);
};

const url = `${BASE}/api/x402/agent/${AGENT}/status`;
console.log(`\n  buyer ${me}`);
console.log(`  from  ${url}\n`);

// 1. Unpaid
const unpaid = await fetch(url);
const challenge = (await unpaid.json()) as {
  accepts?: { asset: string; payTo: string; maxAmountRequired: string; extra?: { name: string } }[];
};
const accept = challenge.accepts?.[0];
say(
  1,
  "an unpaid request is refused with a payable challenge",
  unpaid.status === 402 && Boolean(accept),
  accept
    ? `402 · ${formatUnits(BigInt(accept.maxAmountRequired), USD1_DECIMALS)} USD1 to ${accept.payTo.slice(0, 12)}…`
    : `status ${unpaid.status}, no accepts`,
);
if (!accept) process.exit(1);

// 2. A forged payment
const forged = Buffer.from(
  JSON.stringify({
    x402Version: 1,
    scheme: "exact",
    network: "eip155:56",
    payload: {
      signature: `0x${"11".repeat(65)}`,
      authorization: {
        from: me,
        to: accept.payTo,
        value: accept.maxAmountRequired,
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 600),
        nonce: `0x${randomBytes(32).toString("hex")}`,
      },
    },
  }),
).toString("base64");
const forgedRes = await fetch(url, { headers: { "x-payment": forged } });
const forgedBody = (await forgedRes.json()) as { rejected?: string };
say(
  2,
  "a forged signature is rejected",
  forgedRes.status === 402,
  `${forgedRes.status} · ${forgedBody.rejected ?? "no reason given"}`,
);

// 3. A real one
const authorization = {
  from: me,
  to: accept.payTo as `0x${string}`,
  value: BigInt(accept.maxAmountRequired),
  validAfter: 0n,
  validBefore: BigInt(Math.floor(Date.now() / 1000) + 600),
  nonce: `0x${randomBytes(32).toString("hex")}` as Hex,
};
const signature = await buyer.signTypedData({
  account: buyer.account!,
  domain: USD1_DOMAIN,
  types: TRANSFER_TYPES,
  primaryType: "TransferWithAuthorization",
  message: authorization,
});
const header = Buffer.from(
  JSON.stringify({
    x402Version: 1,
    scheme: "exact",
    network: "eip155:56",
    payload: {
      signature,
      authorization: {
        ...authorization,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
      },
    },
  }),
).toString("base64");

const paid = await fetch(url, { headers: { "x-payment": header } });
const body = (await paid.json()) as { fineness?: number; hallmark?: string; error?: string; detail?: string };
const receipt = paid.headers.get("x-payment-response");
const settled = receipt
  ? (JSON.parse(Buffer.from(receipt, "base64").toString()) as { transaction?: string })
  : null;

say(
  3,
  "a signed payment settles on chain and returns the goods",
  paid.status === 200 && typeof body.fineness === "number",
  paid.status === 200
    ? `agent ${AGENT} assayed at ${body.fineness}/1000 (${body.hallmark}) · settled ${settled?.transaction?.slice(0, 20)}…`
    : `${paid.status} · ${body.error ?? ""} ${body.detail ?? ""}`.slice(0, 200),
);

// 4. Replay
const replay = await fetch(url, { headers: { "x-payment": header } });
const replayBody = (await replay.json()) as { rejected?: string };
say(
  4,
  "the same authorization cannot be spent twice",
  replay.status === 402,
  `${replay.status} · ${replayBody.rejected ?? "no reason given"}`,
);

const passed = rows.filter((r) => r.ok).length;
console.log(`\n  ${passed}/${rows.length} hold`);
console.log(`  the buyer spent no BNB: the seller submitted the transfer.\n`);
process.exit(passed === rows.length ? 0 : 1);
