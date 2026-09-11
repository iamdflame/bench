/**
 * Pays an agent we do not operate, once, over x402, and keeps the evidence.
 *
 *   npx tsx --env-file=.env src/scripts/hire-stranger.ts <target...> [--dry] [--payer a|principal]
 *
 * Targets are fixed with deterministic inputs (the demo address, NFT-A's
 * range) so the answer can be checked against the chain afterwards:
 *
 *   muster-health  342377  Venus health factor of the demo address   0.02 USD1
 *   muster-range   342379  in-range check of NFT-A's ticks           0.02 USD1
 *   agri-grid      269703  grid agent status                         0.05 USDT, Permit2
 *   agri-yield     269705  yield agent status                        0.05 USDT, Permit2
 *   agri-range     269706  LP range agent status (Ranger)            0.05 USDT, Permit2
 *   agri-health    269704  health factor agent status                0.05 USDT, Permit2
 *   vault          338253  Hyperliquid vault list over MCP           0.01 U
 *
 * `--dry` asks unpaid and prints the terms and whether this client can pay
 * them; it signs nothing. Without it, the call is paid by AGENT_A_KEY (or the
 * principal's PRIVATE_KEY with `--payer principal`), the full exchange is
 * written to docs/evidence/, and the record to src/data/paid-calls.json and
 * Postgres. A refusal is recorded exactly as the seller worded it.
 */

import { formatUnits, type Hex } from "viem";
import { exchange, payAndCall, readRequirements, whyUnpayable } from "@/lib/x402/pay";
import { recordPaidCall, toRecord, writeEvidence } from "@/lib/market/paid-calls";
import { listingFor } from "@/lib/market/listing";
import { DEMO_ADDRESS } from "@/lib/demo";
import { closeDb } from "@/lib/db/client";

const AGRI = "https://continuous-locator-four-christine.trycloudflare.com";
const MUSTER = "https://muster.zkasuran.dev/api/agent";
const DEMO_POOL = "0x36696169C63e42cd08ce11f5deeBbCeBae652050";
const NFT_A = { lower: -67380, upper: -67180 };
const e18 = (n: string) => BigInt(Math.round(Number(n) * 1e6)) * 10n ** 12n;

interface Target {
  tokenId: string;
  category: "rebalancing" | "grid-trading" | "yield-optimisation" | "health-factor";
  url: string;
  subject: string;
  max: bigint;
  method?: "GET" | "POST";
  body?: unknown;
}

const TARGETS: Record<string, Target> = {
  "muster-health": {
    tokenId: "342377",
    category: "health-factor",
    url: `${MUSTER}/health-factor?account=${DEMO_ADDRESS}`,
    subject: DEMO_ADDRESS,
    max: e18("0.02"),
  },
  "muster-range": {
    tokenId: "342379",
    category: "rebalancing",
    url: `${MUSTER}/rebalancing?pool=${DEMO_POOL}&lowerTick=${NFT_A.lower}&upperTick=${NFT_A.upper}`,
    subject: `${DEMO_POOL} [${NFT_A.lower}, ${NFT_A.upper})`,
    max: e18("0.02"),
  },
  "agri-grid": { tokenId: "269703", category: "grid-trading", url: `${AGRI}/grid/status`, subject: "grid status", max: e18("0.05") },
  "agri-yield": { tokenId: "269705", category: "yield-optimisation", url: `${AGRI}/yield/status`, subject: "yield status", max: e18("0.05") },
  "agri-range": { tokenId: "269706", category: "rebalancing", url: `${AGRI}/lp-range/status`, subject: "LP range status", max: e18("0.05") },
  "agri-health": { tokenId: "269704", category: "health-factor", url: `${AGRI}/health-factor/status`, subject: "health factor status", max: e18("0.05") },
  "hallmark-grid": {
    tokenId: "338477",
    category: "grid-trading",
    url: "https://hallmark-agents.vercel.app/x402/grid/report",
    subject: "priced grid report with a QuoterV2 simulation of the next order",
    max: e18("0.25"),
  },
  vault: {
    tokenId: "338253",
    category: "yield-optimisation",
    url: "https://hyperliquidvault.space/x402",
    subject: "list_vaults",
    max: e18("0.01"),
    method: "POST",
    body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_vaults", arguments: {} } },
  },
};

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const payerFlag = args.includes("--payer") ? args[args.indexOf("--payer") + 1] : "a";
const names = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--payer");

function keyFor(payer: string): Hex {
  const raw = payer === "principal" ? process.env.PRIVATE_KEY : process.env.AGENT_A_KEY;
  if (!raw) throw new Error(`${payer === "principal" ? "PRIVATE_KEY" : "AGENT_A_KEY"} is not set`);
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

async function dryRun(name: string, t: Target) {
  const body = t.body === undefined ? undefined : JSON.stringify(t.body);
  const { ex, res, text } = await exchange(t.url, {
    method: t.method ?? "GET",
    headers: { accept: "application/json, text/event-stream", ...(body ? { "content-type": "application/json" } : {}) },
    body,
  });
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const offers = readRequirements(parsed, res.headers.get("payment-required"));
  console.log(`${name} (#${t.tokenId}): ${ex.response.status} in ${ex.response.ms} ms`);
  for (const o of offers) {
    const why = whyUnpayable(o);
    console.log(
      `  v${o.x402Version} ${o.scheme}/${o.method ?? "?"} ${formatUnits(o.amount, 18)} of ${o.asset} to ${o.payTo}` +
        `${o.spender ? `, spender ${o.spender}` : ""} via ${o.header}: ${why ? `NOT payable, ${why}` : "payable"}`,
    );
  }
  if (!offers.length) console.log(`  no terms read: ${text.slice(0, 200)}`);
}

async function pay(name: string, t: Target) {
  const call = await payAndCall({ url: t.url, key: keyFor(payerFlag), maxAmount: t.max, method: t.method, body: t.body });
  const evidence = writeEvidence(call, t.tokenId);
  const rec = toRecord(call, {
    tokenId: t.tokenId,
    name: listingFor(t.tokenId)?.name ?? `#${t.tokenId}`,
    category: t.category,
    sponsored: false,
    subject: t.subject,
    evidence,
  });
  await recordPaidCall(rec, { file: true });
  const verdict = call.paid ? (call.delivered ? "PAID AND DELIVERED" : "PAID, NOTHING DELIVERED") : "NOT PAID";
  console.log(`${name} (#${t.tokenId}, ${rec.name}): ${verdict} in ${call.ms} ms`);
  if (call.approveTx) console.log(`  Permit2 approve: ${call.approveTx}`);
  if (call.settlement) console.log(`  settlement: ${call.settlement.tx} (${call.settlement.source})`);
  else if (call.paid) console.log("  settlement: not found on chain yet; the seller accepted the payment header");
  if (call.refused) console.log(`  refused: ${call.refused.slice(0, 500)}`);
  console.log(`  deliverable: ${JSON.stringify(call.deliverable).slice(0, 400)}`);
  console.log(`  evidence: ${evidence}`);
}

async function main() {
  if (!names.length) throw new Error(`name a target: ${Object.keys(TARGETS).join(", ")}`);
  for (const name of names) {
    const t = TARGETS[name];
    if (!t) throw new Error(`unknown target ${name}`);
    try {
      await (dry ? dryRun(name, t) : pay(name, t));
    } catch (e) {
      console.log(`${name}: failed before a verdict: ${(e as Error).message.split("\n")[0]}`);
    }
  }
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
